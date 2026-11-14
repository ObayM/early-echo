package dev.obayy.earlyecho

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Random
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

class TwoPhoneTest {
    private class Phone(
        val rate: Double,
        val clock: Double,
        val outLag: Double,
        val inLag: Double,
        val self: Double,
        val first: Boolean,
        band: Band,
    ) {
        val own = Probe(band, rising = first)
        val other = Probe(band, rising = !first)
        val matcher = Matcher(own, other)
        val ownTrack = Track(own)
        val otherTrack = Track(other)
        val watch = Watch()
        var emit = 0.0
        var placed = first
        var heardFor = 0
        var deafFor = 0
        var lastMove = 0L
        val sent = ArrayList<Reading>()
        val alarms = ArrayList<Double>()
        val shifts = ArrayList<Pair<Double, Double>>()
        val sums = ArrayList<Double>()
        val raw = ArrayList<Pair<Double, Double>>()
        var blocked = 0
    }

    private fun spectrum(p: Probe): Pair<DoubleArray, DoubleArray> {
        val re = DoubleArray(P) { p.wave[it].toDouble() }
        val im = DoubleArray(P)
        Fft(P).run(re, im)
        return re to im
    }

    private fun run(drift: Double, seconds: Double, heat: ClosedFloatingPointRange<Double>, gust: ClosedFloatingPointRange<Double>, label: String, noise: Double = 0.05, echo: Double = 1.0, sync: Double = 1.0, start: Double = 811.3, block: ClosedFloatingPointRange<Double> = 100.0..101.0): Pair<Phone, Phone> {
        val rnd = Random(7)
        val band = Band.HIGH
        val a = Phone(1.0, 0.0, 0.012, 0.009, 0.00035, true, band)
        val b = Phone(1.0 + drift, 5.123, 0.021, 0.006, 0.00030, false, band)
        b.emit = start
        val c = 343.0
        val metres = 1.0
        val fft = Fft(P)
        val specs = mapOf(a to (spectrum(a.own) to spectrum(a.other)), b to (spectrum(b.own) to spectrum(b.other)))

        fun ramp(t: Double, r: ClosedFloatingPointRange<Double>) = when {
            t < r.start || t > r.endInclusive -> 0.0
            t < r.start + 2 -> (t - r.start) / 2
            t > r.endInclusive - 2 -> (r.endInclusive - t) / 2
            else -> 1.0
        }
        fun trip(t: Double, toB: Boolean): Double {
            val warm = 0.02e-6 * t
            val hot = 3e-6 * ramp(t, heat)
            val wind = 1.3e-6 * ramp(t, gust) * (if (toB) -1 else 1)
            return metres / c - warm - hot + wind
        }

        fun landing(src: Phone, rec: Phone, t: Double, path: Double): Double {
            val left = t - path - src.outLag - rec.inLag
            val phase = left * FS * src.rate - src.emit
            val k = Math.floor(t * FS * rec.rate / P)
            val centre = t * FS * rec.rate - k * P
            return wrapP(centre - wrapP(phase))
        }

        fun frame(rec: Phone, t: Double): FloatArray {
            val re = DoubleArray(P)
            val im = DoubleArray(P)
            val peer = if (rec === a) b else a
            val (ownSpec, otherSpec) = specs.getValue(rec)
            fun add(spec: Pair<DoubleArray, DoubleArray>, at: Double, gain: Double) {
                for (k in 0 until P) {
                    val f = if (k <= P / 2) k else k - P
                    val ang = -2 * PI * f * at / P
                    val cr = cos(ang)
                    val ci = sin(ang)
                    re[k] += gain * (spec.first[k] * cr - spec.second[k] * ci)
                    im[k] += gain * (spec.first[k] * ci + spec.second[k] * cr)
                }
            }
            val ownAt = landing(rec, rec, t, rec.self)
            val otherAt = landing(peer, rec, t, trip(t, toB = rec === b))
            add(ownSpec, ownAt, 1.0)
            add(ownSpec, ownAt + 0.0021 * FS, 0.15 * echo)
            add(otherSpec, otherAt, if (t in block) 0.004 else 0.08)
            if (t in block) add(otherSpec, otherAt + 0.0008 * FS, 0.05)
            add(otherSpec, otherAt + 0.0017 * FS, 0.02 * echo)
            fft.run(re, im, inverse = true)
            return FloatArray(P) { (re[it] + noise * rnd.nextGaussian()).toFloat() }
        }

        val syncError = mapOf(a to 0.0018 * sync, b to -0.0024 * sync)
        val start = 0.5
        var t = start
        val dt = P / FS.toDouble()
        val log = StringBuilder()
        while (t < seconds) {
            for (ph in listOf(a, b)) {
                val peer = if (ph === a) b else a
                val tf = t + (if (ph === b) dt * 0.37 else 0.0)
                val f = frame(ph, tf)
                ph.matcher.match(f)
                val o = ph.ownTrack.find(ph.matcher.ownRe, ph.matcher.ownIm, ph.matcher.ownPower, ph.matcher.ownFloor, ph.matcher.ownRRe, ph.matcher.ownRIm)
                val x = ph.otherTrack.find(ph.matcher.otherRe, ph.matcher.otherIm, ph.matcher.otherPower, ph.matcher.otherFloor, ph.matcher.otherRRe, ph.matcher.otherRIm, avoid = o?.at)
                val ok = o != null && x != null && o.db >= Track.HEARD_DB && x.db >= Track.HEARD_DB && ph.ownTrack.steady && ph.otherTrack.steady &&
                    kotlin.math.abs(ph.ownTrack.off) < 2 && kotlin.math.abs(ph.otherTrack.off) < 2
                val nowNs = ((tf + ph.clock) * 1e9).toLong()
                val hearOwn = o != null && o.db >= Track.HEARD_DB
                val hearOther = x != null && x.db >= Track.HEARD_DB
                if (hearOwn && hearOther) ph.heardFor++ else ph.heardFor = 0
                if (hearOwn && !hearOther) ph.deafFor++ else ph.deafFor = 0
                val move = if (ph.first) null else Place.decide(ph.placed, ph.heardFor, ph.deafFor, nowNs - ph.lastMove, if (hearOwn) o!!.at else null, if (hearOther) x!!.at else null)
                if (move != null) {
                    ph.emit += move.samples
                    if (move.places) ph.placed = true
                    ph.lastMove = nowNs
                    ph.heardFor = 0
                    ph.deafFor = 0
                    ph.ownTrack.lose()
                    peer.otherTrack.lose()
                    for (w in listOf(a, b)) {
                        val at = ((tf + w.clock) * 1e9).toLong()
                        w.watch.skip(at - 200_000_000L, at + 1_500_000_000L)
                    }
                    log.append("  %.1f s: second phone moves its chirp%s\n".format(tf, if (move.places) "" else " out from under its own"))
                }
                if (!ph.placed) continue
                val r = Reading(nowNs, if (ok) wrapP(x!!.at - o!!.at) else 0.0, ok)
                ph.watch.addOwn(r)
                val offset = peer.clock - ph.clock + syncError.getValue(peer)
                peer.watch.addPeer(r.copy(t = r.t + (offset * 1e9).toLong()))
                for (row in ph.watch.step(nowNs)) {
                    if (row.shiftUs != null) ph.shifts += (row.t / 1e9 - ph.clock) to row.shiftUs
                    if (row.sumUs != null) ph.sums += row.sumUs
                    if (row.sumUs != null) ph.raw += (row.t / 1e9 - ph.clock) to (row.sumUs - (trip(row.t / 1e9 - ph.clock, true) + trip(row.t / 1e9 - ph.clock, false)) * 1e6)
                    if (row.alarm) ph.alarms += row.t / 1e9 - ph.clock
                    if (row.blocked) ph.blocked++
                }
            }
            t += dt
        }
        println("== $label")
        print(log)
        for (ph in listOf(a, b)) {
            val name = if (ph.first) "first" else "second"
            println("  $name phone: threshold %.2f µs, noise %.3f µs, sum %.1f µs (about %.2f m apart)".format(
                ph.watch.thresholdUs, ph.watch.noiseUs, median(ph.sums), 343 * (median(ph.sums) * 1e-6 + 2 * 0.00035) / 2))
            val bySecond = ph.shifts.groupBy { it.first.toInt() }.toSortedMap()
            println("  " + bySecond.entries.joinToString(" ") { (s, v) -> "$s:%.1f".format(median(v.map { it.second })) })
            val err = ph.raw.groupBy { it.first.toInt() }.toSortedMap()
            println("  sum minus truth: " + err.entries.joinToString(" ") { (s, v) -> "$s:%.2f".format(median(v.map { it.second })) })
            println("  alarm from %.1f to %.1f s".format(ph.alarms.minOrNull() ?: -1.0, ph.alarms.maxOrNull() ?: -1.0))
        }
        return a to b
    }

    private fun check(a: Phone, b: Phone, heat: ClosedFloatingPointRange<Double>, gust: ClosedFloatingPointRange<Double>) {
        for (ph in listOf(a, b)) {
            assertTrue(ph.alarms.any { it in heat }, "heat should trip the alarm")
            assertFalse(ph.alarms.any { it < heat.start || it > heat.endInclusive + 4 }, "only the heat should trip the alarm")
            assertFalse(ph.alarms.any { it in gust }, "moving air must not trip the alarm")
            val calm = ph.shifts.filter { it.first in 20.0..28.0 }.map { it.second }
            assertTrue(calm.maxOf { kotlin.math.abs(it) } < 0.8, "calm readings should stay near zero")
            val hot = ph.shifts.filter { it.first in (heat.start + 3)..(heat.endInclusive - 3) }.map { it.second }
            assertTrue(median(hot) in 4.5..7.5, "3 µs each way should read about 6 µs")
            assertTrue(max(0.0, ph.watch.thresholdUs ?: 99.0) < 3.0)
            val truth = (2 * 1.0 / 343.0 - a.self - b.self) * 1e6
            assertTrue(kotlin.math.abs(ph.watch.firstUs!! - truth) < 3.0, "the round trip at the start should be the true one")
        }
    }

    @Test
    fun anyStartingPlace() {
        for (start in listOf(0.0, 150.0, 400.0, 700.0, 1100.0, 1500.0, 1800.0, 2000.0)) {
            val (_, b) = run(drift = 35e-6, seconds = 24.0, heat = 100.0..101.0, gust = 100.0..101.0, label = "second phone starts at $start", start = start)
            assertTrue(b.placed, "second phone never placed its chirp (start $start)")
            assertTrue(b.watch.thresholdUs != null, "never finished learning the room (start $start)")
        }
    }

    @Test
    fun clean() {
        run(drift = 35e-6, seconds = 40.0, heat = 100.0..101.0, gust = 100.0..101.0, label = "clean, drift only", noise = 0.0, echo = 0.0, sync = 0.0)
        run(drift = 0.0, seconds = 40.0, heat = 100.0..101.0, gust = 100.0..101.0, label = "clean, no drift", noise = 0.0, echo = 0.0, sync = 0.0)
        run(drift = 35e-6, seconds = 40.0, heat = 100.0..101.0, gust = 100.0..101.0, label = "noise only", noise = 0.05, echo = 0.0, sync = 0.0)
    }

    @Test
    fun heatTripsGustDoesNot() {
        val heat = 30.0..42.0
        val gust = 55.0..67.0
        val (a, b) = run(drift = 35e-6, seconds = 80.0, heat = heat, gust = gust, label = "clocks 35 ppm apart")
        check(a, b, heat, gust)
    }

    @Test
    fun handInTheLine() {
        for (block in listOf(30.0..34.0, 30.0..75.0)) {
            val (a, b) = run(drift = 35e-6, seconds = block.endInclusive + 40, heat = 200.0..201.0, gust = 200.0..201.0, label = "hand in the line, $block", block = block)
            for (ph in listOf(a, b)) {
                assertTrue(ph.blocked > 0, "the hand should be noticed")
                assertTrue(ph.alarms.isEmpty(), "the alarm must stay off when the hand leaves")
                val after = ph.shifts.filter { it.first in (block.endInclusive + 3)..(block.endInclusive + 38) }.map { it.second }
                assertTrue(after.isNotEmpty() && after.maxOf { kotlin.math.abs(it) } < 1.0, "readings after the hand should be back near zero")
            }
        }
    }

    @Test
    fun fastDriftMovesTheChirp() {
        val heat = 50.0..62.0
        val gust = 30.0..42.0
        val (a, b) = run(drift = 180e-6, seconds = 75.0, heat = heat, gust = gust, label = "clocks 180 ppm apart")
        check(a, b, heat, gust)
    }
}
