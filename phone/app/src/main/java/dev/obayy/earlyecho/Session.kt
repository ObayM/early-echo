package dev.obayy.earlyecho

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.net.InetAddress
import java.util.Locale
import kotlin.random.Random

class Session(private val context: Context, private val onAlarm: (Boolean) -> Unit) {
    enum class Phase { SEARCH, START, LEARN, WATCH }

    private class Peer(val id: Long, val name: String, var address: InetAddress, var seen: Long)

    private val lock = Any()
    private val prefs = context.getSharedPreferences("early-echo", Context.MODE_PRIVATE)
    private val id = Random.nextLong(1, Long.MAX_VALUE)
    val name = deviceName(context)
    private val link = Link(::onMessage)
    private var audio: Audio? = null
    private val watch = Watch(Sensitivity.valueOf(prefs.getString("sensitivity", "NORMAL")!!))
    private var timer: Thread? = null
    @Volatile private var running = false

    private var phase = Phase.SEARCH
    private var peer: Peer? = null
    private var first = true
    private var band = Band.valueOf(prefs.getString("band", "HIGH")!!)
    private var typed: InetAddress? = null
    private var pairedAt = 0L

    private val syncs = ArrayDeque<LongArray>()
    private var offset: Long? = null
    private var lastPing = 0L
    private var lastHello = 0L

    private var placed = false
    private var heardFor = 0
    private var deafFor = 0
    private var lastMove = 0L
    private var ownDb = 0.0
    private var otherDb = 0.0
    private var heardOwnAt = 0L
    private var heardOtherAt = 0L
    private val outbox = ArrayList<String>()

    private val trace = ArrayDeque<DoubleArray>()
    private var lastPoint = 0L
    private val marks = ArrayList<Pair<Long, String>>()
    private var lit = false
    private var other = false
    private var wasAlarm = false
    private var lastSum: Double? = null
    private var lastRow: Row? = null
    private val used = ArrayDeque<Pair<Long, Boolean>>()
    private var measured: Double? = prefs.getFloat("distance", 0f).toDouble().takeIf { it > 0 }
    private var notice: String? = null
    private var noticeAt = 0L

    private var logStart = 0L
    private var log = StringBuilder()
    private var rows = 0
    private var sound: SoundFile? = null
    private var keepSound = prefs.getBoolean("sound", false)
    private var savedVolume: Int? = null

    fun start() {
        synchronized(lock) {
            if (running) return
            running = true
            link.start()
            newLog(now())
        }
        timer = Thread({
            while (running) {
                tick()
                Thread.sleep(100)
            }
        }, "session").also { it.start() }
    }

    fun stop() {
        synchronized(lock) {
            if (!running) return
            running = false
            peer?.let { link.send(it.address, "X", id) }
            unpair()
        }
        timer?.join(500)
        link.stop()
        sound?.discard()
    }

    private fun now() = SystemClock.elapsedRealtimeNanos()

    private fun tick(): Unit = synchronized(lock) {
        val now = now()
        val p = peer
        if (p == null) {
            if (now - lastHello > 1_000_000_000L) {
                lastHello = now
                link.shout("H", id, name, band, 0)
                typed?.let { link.send(it, "H", id, name, band, 0) }
            }
            return@synchronized
        }
        if (now - lastHello > 2_000_000_000L) {
            lastHello = now
            link.send(p.address, "H", id, name, band, 1)
        }
        val every = if (now - pairedAt < 6_000_000_000L) 250_000_000L else 2_000_000_000L
        if (now - lastPing > every) {
            lastPing = now
            link.send(p.address, "P", now)
        }
        if (outbox.isNotEmpty()) {
            link.send(p.address, "G", outbox.joinToString(","))
            outbox.clear()
        }
        if (now - p.seen > 6_000_000_000L) {
            notice("Lost ${p.name}. Looking for it again.")
            unpair()
        }
    }

    private fun onMessage(parts: List<String>, from: InetAddress): Unit = synchronized(lock) {
        if (!running) return@synchronized
        val now = now()
        val p = peer
        try {
            when (parts[0]) {
                "H" -> {
                    val pid = parts[1].toLong()
                    if (pid == id) return@synchronized
                    val theirBand = Band.valueOf(parts[3])
                    if (p == null) {
                        pair(pid, parts[2], from, theirBand)
                        link.send(from, "H", id, name, band, 1)
                    } else if (p.id == pid) {
                        p.seen = now
                        p.address = from
                        if (!first && theirBand != band) {
                            band = theirBand
                            startAudio()
                        }
                    }
                }
                "P" -> link.send(from, "Q", parts[1], now, now())
                "Q" -> {
                    val t1 = parts[1].toLong()
                    val t2 = parts[2].toLong()
                    val t3 = parts[3].toLong()
                    val trip = (now - t1) - (t3 - t2)
                    syncs.addLast(longArrayOf(trip, ((t2 - t1) + (t3 - now)) / 2))
                    while (syncs.size > 40) syncs.removeFirst()
                    offset = syncs.minBy { it[0] }[1]
                }
                "G" -> {
                    val off = offset ?: return@synchronized
                    for (r in parts[1].split(',')) {
                        val f = r.split(';')
                        if (f.size < 3) continue
                        watch.addPeer(Reading(f[0].toLong() - off, f[1].toDouble(), f[2] == "1"))
                    }
                }
                "M" -> {
                    val off = offset ?: 0L
                    marks += (parts[1].toLong() - off) to parts[2]
                    noteMark(parts[2])
                }
                "R" -> {
                    audio?.otherMoved()
                    val t = parts[1].toLong() - (offset ?: 0L)
                    watch.skip(t - 200_000_000L, t + 1_500_000_000L)
                }
                "N" -> relearnHere()
                "X" -> if (p != null && parts[1].toLong() == p.id) {
                    notice("${p.name} closed Early Echo.")
                    unpair()
                }
            }
            if (p != null && from == p.address) p.seen = now
        } catch (_: Exception) {
        }
    }

    private fun pair(pid: Long, theirName: String, from: InetAddress, theirBand: Band) {
        peer = Peer(pid, theirName, from, now())
        first = id < pid
        if (!first) band = theirBand
        pairedAt = now()
        syncs.clear()
        offset = null
        newLog(now())
        startAudio()
    }

    private fun unpair() {
        peer = null
        phase = Phase.SEARCH
        offset = null
        syncs.clear()
        outbox.clear()
        val old = audio
        audio = null
        if (old != null) Thread { old.stop() }.start()
        watch.reset()
        lastRow = null
        used.clear()
        if (wasAlarm) { wasAlarm = false; onAlarm(false) }
        restoreVolume()
    }

    private fun startAudio() {
        val old = audio
        lateinit var fresh: Audio
        fresh = Audio(context, Probe(band, rising = first), Probe(band, rising = !first)) { f -> onFrame(fresh, f) }
        fresh.keepSound = keepSound
        audio = fresh
        Thread { old?.stop(); fresh.start() }.start()
        placed = first
        heardFor = 0
        deafFor = 0
        watch.reset()
        lastRow = null
        used.clear()
        trace.clear()
        phase = Phase.START
        if (wasAlarm) { wasAlarm = false; onAlarm(false) }
        loudest()
    }

    private fun onFrame(source: Audio, f: Frame): Unit = synchronized(lock) {
        if (source !== audio || !running) return@synchronized
        val o = f.own
        val x = f.other
        if (o != null) ownDb += 0.2 * (o.db - ownDb)
        if (x != null) otherDb += 0.2 * (x.db - otherDb)
        val hearOwn = o != null && o.db >= Track.HEARD_DB
        val hearOther = x != null && x.db >= Track.HEARD_DB
        val wall = now()
        if (hearOwn) heardOwnAt = wall
        if (hearOther) heardOtherAt = wall
        if (hearOwn && hearOther) heardFor++ else heardFor = 0
        if (hearOwn && !hearOther) deafFor++ else deafFor = 0

        val move = if (first) null else Place.decide(placed, heardFor, deafFor, f.t - lastMove, if (hearOwn) o!!.at else null, if (hearOther) x!!.at else null)
        if (move != null) {
            source.delay(move.samples)
            if (move.places) placed = true
            lastMove = f.t
            heardFor = 0
            deafFor = 0
            watch.skip(f.t - 200_000_000L, f.t + 1_500_000_000L)
            peer?.let { link.send(it.address, "R", f.t) }
        }
        if (!placed) return@synchronized

        val ok = hearOwn && hearOther && f.steady
        val r = Reading(f.t, if (ok) wrapP(x!!.at - o!!.at) else 0.0, ok)
        watch.addOwn(r)
        outbox += String.format(Locale.ROOT, "%d;%.4f;%d", r.t, r.gap, if (ok) 1 else 0)
        f.sound?.let { sound?.write(it) }
        for (row in watch.step(f.t)) {
            row.sumUs?.let { lastSum = it; lastRow = row }
            logRow(row)
        }
        val shift = watch.shiftUs
        if (watch.startedAt != null && shift != null && f.t - lastPoint >= 250_000_000L) {
            lastPoint = f.t
            trace.addLast(doubleArrayOf(f.t.toDouble(), shift))
            while (trace.size > 0 && f.t - trace.first()[0] > 70e9) trace.removeFirst()
        }
        phase = when {
            watch.learnedAt != null -> Phase.WATCH
            watch.startedAt != null -> Phase.LEARN
            else -> Phase.START
        }
        if (watch.alarm != wasAlarm) {
            wasAlarm = watch.alarm
            onAlarm(wasAlarm)
        }
    }

    private fun logRow(r: Row) {
        fun n(v: Double?, d: Int = 3) = if (v == null) "" else String.format(Locale.ROOT, "%.${d}f", v)
        log.append(String.format(Locale.ROOT, "%.3f", (r.t - logStart) / 1e9)).append(',')
            .append(n(r.gapUs)).append(',').append(n(r.peerGapUs)).append(',').append(n(r.sumUs)).append(',')
            .append(n(r.smoothUs)).append(',').append(n(r.baseUs)).append(',').append(n(r.shiftUs)).append(',')
            .append(n(r.thresholdUs)).append(',').append(if (r.alarm) 1 else 0).append(',').append(if (lit) 1 else 0).append(',').append(if (other) 1 else 0).append(',')
            .append(n(ownDb, 1)).append(',').append(n(otherDb, 1)).append(',').append(n(speed(r.smoothUs))).append(',').append(if (r.blocked) 1 else 0).append('\n')
        rows++
        used.addLast(r.t to (r.sumUs != null))
        while (used.isNotEmpty() && r.t - used.first().first > 10_000_000_000L) used.removeFirst()
    }

    private fun newLog(at: Long) {
        logStart = at
        log = StringBuilder("seconds,own_gap_us,other_gap_us,sum_us,smooth_us,baseline_us,shift_us,threshold_us,alarm,flame_lit,not_flame,own_db,other_db,speed_mps,blocked\n")
        rows = 0
        marks.clear()
        if (lit) marks += at to "lit"
        if (other) marks += at to "other"
        sound?.discard()
        sound = if (keepSound) SoundFile(context.cacheDir) else null
    }

    private fun notice(text: String) {
        notice = text
        noticeAt = now()
    }

    fun mark(state: String): Unit = synchronized(lock) {
        val t = now()
        marks += t to state
        noteMark(state)
        peer?.let { link.send(it.address, "M", t, state) }
    }

    private fun noteMark(state: String) {
        when (state) {
            "lit", "out" -> lit = state == "lit"
            "other", "other-end" -> other = state == "other"
        }
    }

    fun relearn(): Unit = synchronized(lock) {
        relearnHere()
        peer?.let { link.send(it.address, "N") }
    }

    private fun relearnHere() {
        watch.relearn()
        trace.clear()
        if (wasAlarm) { wasAlarm = false; onAlarm(false) }
        if (phase == Phase.WATCH || phase == Phase.LEARN) phase = Phase.LEARN
    }

    fun setSensitivity(s: String): Unit = synchronized(lock) {
        watch.sensitivity = Sensitivity.valueOf(s)
        watch.rethreshold()
        prefs.edit().putString("sensitivity", s).apply()
    }

    fun setBand(b: String): Unit = synchronized(lock) {
        val next = Band.valueOf(b)
        if (!first || next == band) return@synchronized
        band = next
        prefs.edit().putString("band", b).apply()
        peer?.let {
            link.send(it.address, "H", id, name, band, 1)
            startAudio()
        }
    }

    fun setSound(on: Boolean): Unit = synchronized(lock) {
        keepSound = on
        prefs.edit().putBoolean("sound", on).apply()
        audio?.keepSound = on
        if (on && sound == null) sound = SoundFile(context.cacheDir)
        if (!on) { sound?.discard(); sound = null }
    }

    fun setDistance(cm: String): Boolean = synchronized(lock) {
        val text = cm.trim().replace(',', '.')
        if (text.isEmpty()) {
            measured = null
            prefs.edit().remove("distance").apply()
            return@synchronized true
        }
        val v = text.toDoubleOrNull() ?: return@synchronized false
        if (v < 10 || v > 1000) return@synchronized false
        measured = v / 100
        prefs.edit().putFloat("distance", (v / 100).toFloat()).apply()
        true
    }

    fun connectTo(address: String): Boolean {
        val a = try { InetAddress.getByName(address.trim()) } catch (_: Exception) { return false }
        synchronized(lock) {
            typed = a
            lastHello = 0
        }
        return true
    }

    fun save(): String {
        val csv: String
        val notes: String
        val wav: SoundFile?
        val stamp: String
        synchronized(lock) {
            if (rows == 0) return "Nothing to save yet."
            csv = log.toString()
            stamp = java.text.SimpleDateFormat("yyyy-MM-dd-HHmmss", Locale.ROOT).format(java.util.Date())
            notes = notes()
            wav = sound
            sound = null
            newLog(now())
        }
        return try {
            val base = "early-echo-$stamp-${if (first) "first" else "second"}"
            Saver.text(context, "$base.csv", "text/csv", csv)
            Saver.text(context, "$base-notes.txt", "text/plain", notes)
            wav?.let { Saver.sound(context, "$base.wav", it) }
            synchronized(lock) { if (keepSound && sound == null) sound = SoundFile(context.cacheDir) }
            "Saved to Download/Early Echo: $base"
        } catch (e: Exception) {
            "Couldn't save (${e.message})."
        }
    }

    private fun notes(): String {
        val p = peer
        val lines = mutableListOf(
            "Early Echo test, saved ${java.util.Date()}",
            "This phone: $name (${if (first) "first phone, rising chirp" else "second phone, falling chirp"})",
            "Other phone: ${p?.name ?: "none"}",
            "Pitch: ${band.label} (${band.lo.toInt()} to ${band.hi.toInt()} Hz), chirp ${L * 1000 / FS} ms every ${P * 1000.0 / FS} ms",
            "Sensitivity: ${watch.sensitivity.label}",
            "Room's own wobble: ${watch.noiseUs?.let { String.format(Locale.ROOT, "%.2f µs", it) } ?: "not learned"}",
            "Alarm at: ${watch.thresholdUs?.let { String.format(Locale.ROOT, "%.2f µs", it) } ?: "not set"}",
            "Phones about ${distance()?.let { String.format(Locale.ROOT, "%.2f m", it) } ?: "unknown"} apart",
            "Distance for the speed of sound: ${basis()?.let { String.format(Locale.ROOT, "%.3f m", it) } ?: "unknown"} (${if (measured != null) "measured with a tape" else "worked out from the start, taking the air as 20 °C"})",
            "Speed of sound at the start: ${say(speed(watch.firstUs))}. At the save: ${say(speed(watch.smoothUs))}",
            "Round trip at the start: ${us(watch.firstUs)}. Lowest since: ${us(watch.lowUs)}. Highest: ${us(watch.highUs)}",
            "Marks (seconds from the start of the file):",
        )
        for ((t, s) in marks) lines += String.format(Locale.ROOT, "  %.1f  %s", (t - logStart) / 1e9, MARKS[s] ?: s)
        lines += ""
        lines += "Columns: own_gap_us and other_gap_us are each phone's gap from its own chirp to the other's. sum_us is their sum: the"
        lines += "trip both ways minus each phone's speaker-to-microphone path. shift_us is how much earlier than the baseline the sound"
        lines += "is arriving (positive means hotter or faster air on the line). alarm is 1 while the alarm is on. flame_lit is 1"
        lines += "between the Flame lit and Flame out taps, not_flame between the Not a flame and It stopped taps. speed_mps is the"
        lines += "speed of sound from smooth_us and the distance above. It takes each phone to hear its own chirp from about 10 cm away:"
        lines += "1 cm off moves it by about 1.7 m/s with the phones 1 m apart. Changes in it don't depend on that. blocked is 1 while"
        lines += "the sound arrives far later than the baseline (something in the line, sound going round it): those rows are left"
        lines += "out of the baseline and have no shift."
        return lines.joinToString("\n") + "\n"
    }

    private fun say(speed: Double?) = speed?.let { String.format(Locale.ROOT, "%.2f m/s (%.1f °C)", it, Air.celsius(it)) } ?: "unknown"
    private fun us(v: Double?) = v?.let { String.format(Locale.ROOT, "%.2f µs", it) } ?: "unknown"

    private fun distance(): Double? = lastSum?.let { Air.distance(Air.speedAt(20.0), it) }

    private fun basis(): Double? = measured ?: watch.firstUs?.let { Air.distance(Air.speedAt(20.0), it) }

    private fun speed(sumUs: Double?): Double? {
        val m = basis() ?: return null
        return sumUs?.let { Air.speed(m, it) }
    }

    private var addresses = emptyList<String>()
    private var addressesAt = 0L

    private fun num(v: Double?): Any = if (v == null || !v.isFinite()) JSONObject.NULL else v

    fun snapshot(): String = synchronized(lock) {
        val now = now()
        val p = peer
        if (notice != null && now - noticeAt > 6_000_000_000L) notice = null
        JSONObject().apply {
            put("phase", phase.name.lowercase())
            put("me", name)
            if (now - addressesAt > 3_000_000_000L) { addresses = Link.addresses(); addressesAt = now }
            put("addresses", JSONArray(addresses))
            put("first", first)
            put("peer", p?.name ?: JSONObject.NULL)
            put("band", band.name)
            put("sensitivity", watch.sensitivity.name)
            put("sound", keepSound)
            put("ownDb", num(ownDb))
            put("otherDb", num(otherDb))
            put("hearOwn", now - heardOwnAt < 1_500_000_000L)
            put("hearOther", now - heardOtherAt < 1_500_000_000L)
            put("clocks", offset != null)
            put("distance", num(distance()))
            put("learnLeft", num(watch.learnLeft(lastFrameTime())))
            put("shift", num(watch.shiftUs))
            put("threshold", num(watch.thresholdUs))
            put("noise", num(watch.noiseUs))
            put("alarm", watch.alarm)
            put("alarmFor", num(watch.alarmSince?.let { (lastFrameTime() - it) / 1e9 }))
            put("blocked", watch.blockedSince != null)
            put("blockedFor", num(watch.blockedSince?.let { (now - it) / 1e9 }))
            put("lit", lit)
            put("other", other)
            val end = lastFrameTime()
            put("trace", JSONArray().apply {
                for (pt in trace) if (end - pt[0] <= 60e9 && pt[1].isFinite()) put(JSONArray().put(((pt[0] - end) / 1e9).round(2)).put(pt[1].round(3)))
            })
            put("marks", JSONArray().apply {
                for ((t, s) in marks) if (end - t <= 60e9) put(JSONArray().put(((t - end) / 1e9).round(2)).put(s))
            })
            put("seconds", (now - logStart) / 1e9)
            put("rows", rows)
            put("notice", notice ?: JSONObject.NULL)
            put("error", audio?.error ?: JSONObject.NULL)
            val c = speed(watch.smoothUs)
            val cRef = speed(watch.baseUs)
            val cFirst = speed(watch.firstUs)
            put("debug", JSONObject().apply {
                put("sum", num(watch.smoothUs))
                put("raw", num(lastSum))
                put("base", num(watch.baseUs))
                put("first", num(watch.firstUs))
                put("low", num(watch.lowUs))
                put("high", num(watch.highUs))
                put("ownGap", num(lastRow?.gapUs))
                put("otherGap", num(lastRow?.peerGapUs))
                put("measured", num(measured))
                put("basis", num(basis()))
                put("speed", num(c))
                put("speedRef", num(cRef))
                put("speedFirst", num(cFirst))
                put("temp", num(c?.let(Air::celsius)))
                put("tempRef", num(cRef?.let(Air::celsius)))
                put("tempFirst", num(cFirst?.let(Air::celsius)))
                put("used", num(if (used.isEmpty()) null else used.count { it.second } * 100.0 / used.size))
                put("pingMs", num(syncs.minByOrNull { it[0] }?.let { it[0] / 1e6 }))
                put("pingLastMs", num(syncs.lastOrNull()?.let { it[0] / 1e6 }))
            })
        }.toString()
    }

    private fun lastFrameTime(): Long = trace.lastOrNull()?.get(0)?.toLong() ?: now()

    private fun Double.round(d: Int): Double {
        val m = Math.pow(10.0, d.toDouble())
        return Math.round(this * m) / m
    }

    private fun loudest() {
        val am = context.getSystemService(AudioManager::class.java)
        try {
            if (savedVolume == null) savedVolume = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            am.setStreamVolume(AudioManager.STREAM_MUSIC, am.getStreamMaxVolume(AudioManager.STREAM_MUSIC), 0)
        } catch (_: Exception) {
        }
    }

    private fun restoreVolume() {
        val v = savedVolume ?: return
        savedVolume = null
        try {
            context.getSystemService(AudioManager::class.java).setStreamVolume(AudioManager.STREAM_MUSIC, v, 0)
        } catch (_: Exception) {
        }
    }

    companion object {
        private val MARKS = mapOf("lit" to "flame lit", "out" to "flame out", "other" to "not a flame, starts", "other-end" to "not a flame, stopped")

        fun deviceName(context: Context): String {
            val n = try { Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME) } catch (_: Exception) { null }
            return (n?.takeIf { it.isNotBlank() } ?: Build.MODEL).replace(Regex("[|,;]"), " ").take(40)
        }
    }
}
