package dev.obayy.earlyecho

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

data class Reading(val t: Long, val gap: Double, val ok: Boolean)

enum class Sensitivity(val floorUs: Double, val times: Double, val label: String) {
    HIGH(0.5, 4.0, "High"),
    NORMAL(1.0, 6.0, "Normal"),
    LOW(2.0, 9.0, "Low"),
}

data class Row(
    val t: Long,
    val gapUs: Double,
    val peerGapUs: Double?,
    val sumUs: Double?,
    val smoothUs: Double?,
    val baseUs: Double?,
    val shiftUs: Double?,
    val thresholdUs: Double?,
    val alarm: Boolean,
    val blocked: Boolean = false,
)

class Watch(var sensitivity: Sensitivity = Sensitivity.NORMAL) {
    private val own = ArrayDeque<Reading>()
    private val peer = ArrayDeque<Reading>()
    private val sums = ArrayDeque<Pair<Long, Double>>()
    private val points = ArrayDeque<Point>()
    private val skips = ArrayDeque<LongRange>()

    private class Point(val t: Long, val v: Double, val alarm: Boolean)

    var learnedAt: Long? = null
        private set
    var startedAt: Long? = null
        private set
    var thresholdUs: Double? = null
        private set
    var noiseUs: Double? = null
        private set
    var alarm = false
        private set
    var alarmSince: Long? = null
        private set
    var shiftUs: Double? = null
        private set
    var sumUs: Double? = null
        private set
    var smoothUs: Double? = null
        private set
    var baseUs: Double? = null
        private set
    var firstUs: Double? = null
        private set
    var lowUs: Double? = null
        private set
    var highUs: Double? = null
        private set
    var blockedSince: Long? = null
        private set
    private var over: Long? = null
    private var under: Long? = null
    private var fit: Line? = null
    private var fitAt = 0L

    fun reset() {
        own.clear(); peer.clear(); sums.clear(); points.clear(); skips.clear()
        learnedAt = null; startedAt = null; thresholdUs = null; noiseUs = null
        alarm = false; alarmSince = null; shiftUs = null; sumUs = null; over = null; under = null; fit = null
        smoothUs = null; baseUs = null; firstUs = null; lowUs = null; highUs = null; blockedSince = null
    }

    fun relearn() {
        points.clear()
        sums.clear()
        startedAt = null
        learnedAt = null
        thresholdUs = null
        alarm = false
        alarmSince = null
        fit = null
        firstUs = null; lowUs = null; highUs = null; blockedSince = null
    }

    fun skip(from: Long, to: Long) {
        skips.addLast(from..to)
        while (skips.size > 20) skips.removeFirst()
    }

    fun addOwn(r: Reading) {
        own.addLast(r)
    }

    fun addPeer(r: Reading) {
        if (peer.isNotEmpty() && r.t <= peer.last().t) return
        peer.addLast(r)
        while (peer.size > 400) peer.removeFirst()
    }

    fun step(now: Long, late: Long = 1_500_000_000L): List<Row> {
        val rows = ArrayList<Row>()
        val newest = peer.lastOrNull()?.t
        while (own.isNotEmpty()) {
            val r = own.first()
            if (newest == null || newest < r.t) {
                if (now - r.t < late) break
                own.removeFirst()
                rows += Row(r.t, r.gap * US_PER_SAMPLE, null, null, null, null, null, thresholdUs, alarm)
                continue
            }
            own.removeFirst()
            val other = if (r.ok && skips.none { r.t in it }) peerAt(r.t) else null
            if (other == null) {
                rows += Row(r.t, r.gap * US_PER_SAMPLE, null, null, null, null, null, thresholdUs, alarm)
                continue
            }
            rows += take(r, other)
        }
        return rows
    }

    private fun peerAt(t: Long): Double? {
        var before: Reading? = null
        var after: Reading? = null
        for (p in peer) {
            if (p.t <= t) before = p else { after = p; break }
        }
        if (before == null || after == null || !before.ok || !after.ok) return null
        if (after.t - before.t > 150_000_000L) return null
        val step = wrapHalf(after.gap - before.gap)
        if (abs(step) > 0.5) return null
        return before.gap + step * (t - before.t).toDouble() / (after.t - before.t)
    }

    private fun take(r: Reading, other: Double): Row {
        val sum = (wrapP(r.gap + other + P / 8.0) - P / 8.0) * US_PER_SAMPLE
        if (startedAt == null) startedAt = r.t
        sumUs = sum
        sums.addLast(r.t to sum)
        while (sums.isNotEmpty() && r.t - sums.first().first > SMOOTH) sums.removeFirst()
        val smooth = median(sums.map { it.second })
        smoothUs = smooth

        val expect = fit?.at(r.t)
        val blocked = learnedAt != null && expect != null && smooth - expect > max(BLOCKED, 4 * (thresholdUs ?: 0.0))
        if (!blocked) blockedSince = null else if (blockedSince == null) blockedSince = r.t

        if (!blocked && (points.isEmpty() || r.t - points.last().t >= POINT)) {
            points.addLast(Point(r.t, smooth, alarm))
            while (points.isNotEmpty() && r.t - points.first().t > KEEP) points.removeFirst()
        }
        if (!alarm && !blocked && r.t - fitAt >= 1_000_000_000L) {
            fitAt = r.t
            val use = points.filter { r.t - it.t in GAP..BACK && !it.alarm }
            val old = fit
            fit = when {
                use.size >= 6 -> Line.of(use.map { it.t }, use.map { it.v })
                learnedAt != null && old != null -> Line(0.0, old.at(r.t), r.t)
                else -> Line(0.0, use.map { it.v }.ifEmpty { listOf(smooth) }.average(), r.t)
            }
        }
        val start = startedAt!!
        if (learnedAt == null && r.t - start >= LEARN) {
            val use = points.filter { it.t - start >= 2_000_000_000L }
            val line = Line.of(use.map { it.t }, use.map { it.v })
            val spread = if (use.size < 5) 0.0 else sqrt(use.map { (it.v - line.at(it.t)).let { e -> e * e } }.average())
            noiseUs = spread
            thresholdUs = max(sensitivity.floorUs, sensitivity.times * spread)
            learnedAt = r.t
            fit = line
            fitAt = r.t
            firstUs = if (use.isEmpty()) smooth else median(use.map { it.v })
        }
        if (firstUs != null && !blocked) {
            lowUs = min(lowUs ?: smooth, smooth)
            highUs = max(highUs ?: smooth, smooth)
        }
        val base = fit?.at(r.t) ?: smooth
        baseUs = base
        if (blocked) {
            shiftUs = null
            return Row(r.t, r.gap * US_PER_SAMPLE, other * US_PER_SAMPLE, sum, smooth, base, null, thresholdUs, alarm, blocked = true)
        }
        val shift = base - smooth
        shiftUs = shift
        val thr = thresholdUs
        if (thr != null) {
            if (!alarm) {
                if (shift > thr) {
                    if (over == null) over = r.t
                    if (r.t - over!! >= RISE) { alarm = true; alarmSince = r.t; under = null }
                } else over = null
            } else {
                if (shift < thr / 2) {
                    if (under == null) under = r.t
                    if (r.t - under!! >= FALL) { alarm = false; alarmSince = null; over = null }
                } else under = null
            }
        }
        return Row(r.t, r.gap * US_PER_SAMPLE, other * US_PER_SAMPLE, sum, smooth, base, shift, thr, alarm)
    }

    fun rethreshold() {
        val n = noiseUs ?: return
        thresholdUs = max(sensitivity.floorUs, sensitivity.times * n)
    }

    val learning get() = startedAt != null && learnedAt == null

    fun learnLeft(now: Long): Double? = startedAt?.let { if (learnedAt != null) null else max(0.0, (LEARN - (now - it)) / 1e9) }

    companion object {
        const val SMOOTH = 1_000_000_000L
        const val POINT = 250_000_000L
        const val KEEP = 60_000_000_000L
        const val GAP = 5_000_000_000L
        const val BACK = 35_000_000_000L
        const val LEARN = 12_000_000_000L
        const val RISE = 1_000_000_000L
        const val FALL = 3_000_000_000L
        const val BLOCKED = 5.0
    }
}

class Line(private val slope: Double, private val mid: Double, private val t0: Long) {
    fun at(t: Long) = mid + slope * (t - t0) / 1e9

    companion object {
        fun of(ts: List<Long>, vs: List<Double>): Line {
            if (ts.isEmpty()) return Line(0.0, 0.0, 0)
            val t0 = ts[ts.size / 2]
            val xs = ts.map { (it - t0) / 1e9 }
            val mx = xs.average()
            val my = vs.average()
            var num = 0.0
            var den = 0.0
            for (i in xs.indices) { num += (xs[i] - mx) * (vs[i] - my); den += (xs[i] - mx) * (xs[i] - mx) }
            val slope = if (den > 1e-9) num / den else 0.0
            return Line(slope, my - slope * mx, t0)
        }
    }
}

fun median(v: List<Double>): Double {
    if (v.isEmpty()) return 0.0
    val s = v.sorted()
    return if (s.size % 2 == 1) s[s.size / 2] else (s[s.size / 2 - 1] + s[s.size / 2]) / 2
}

object Place {
    fun delay(own: Double, other: Double): Int = Math.floorMod(Math.round(other + P / 2 - own).toInt(), P)

    fun drifted(own: Double, other: Double): Boolean = abs(wrapHalf(own - other - P / 2)) > (P / 2 - L) / 2

    class Move(val samples: Int, val places: Boolean)

    const val DEAF = 35

    fun decide(placed: Boolean, heardFor: Int, deafFor: Int, sinceMove: Long, own: Double?, other: Double?): Move? = when {
        own == null -> null
        other == null -> if (!placed && deafFor > DEAF) Move(P / 3, false) else null
        !placed -> if (heardFor > 8) Move(delay(own, other), true) else null
        sinceMove > 3_000_000_000L && drifted(own, other) -> Move(delay(own, other), true)
        else -> null
    }
}
