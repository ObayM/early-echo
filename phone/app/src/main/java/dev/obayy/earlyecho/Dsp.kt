package dev.obayy.earlyecho

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sin

const val FS = 48000
const val P = 2048
const val L = 640
const val US_PER_SAMPLE = 1e6 / FS

enum class Band(val lo: Double, val hi: Double, val label: String) {
    HIGH(17000.0, 21000.0, "High"),
    MID(11000.0, 15000.0, "Middle"),
}

fun wrapP(v: Double): Double {
    val r = v - floor(v / P) * P
    return if (r >= P) 0.0 else r
}

fun wrapHalf(v: Double): Double = wrapP(v + P / 2) - P / 2

class Fft(private val n: Int) {
    private val cosT = DoubleArray(n / 2) { cos(2 * PI * it / n) }
    private val sinT = DoubleArray(n / 2) { sin(2 * PI * it / n) }
    private val rev = IntArray(n).also { r ->
        val bits = Integer.numberOfTrailingZeros(n)
        for (i in 0 until n) r[i] = Integer.reverse(i) ushr (32 - bits)
    }

    fun run(re: DoubleArray, im: DoubleArray, inverse: Boolean = false) {
        for (i in 0 until n) {
            val j = rev[i]
            if (j > i) {
                var t = re[i]; re[i] = re[j]; re[j] = t
                t = im[i]; im[i] = im[j]; im[j] = t
            }
        }
        val sign = if (inverse) 1.0 else -1.0
        var size = 2
        while (size <= n) {
            val half = size / 2
            val step = n / size
            var start = 0
            while (start < n) {
                var k = 0
                for (j in start until start + half) {
                    val wr = cosT[k]
                    val wi = sign * sinT[k]
                    val xr = re[j + half] * wr - im[j + half] * wi
                    val xi = re[j + half] * wi + im[j + half] * wr
                    re[j + half] = re[j] - xr
                    im[j + half] = im[j] - xi
                    re[j] += xr
                    im[j] += xi
                    k += step
                }
                start += size
            }
            size *= 2
        }
        if (inverse) for (i in 0 until n) { re[i] /= n; im[i] /= n }
    }
}

class Probe(val band: Band, val rising: Boolean) {
    val bins: IntArray = (0..P / 2).filter { it.toDouble() * FS / P in band.lo..band.hi }.toIntArray()
    val wave = FloatArray(P)
    val specRe = DoubleArray(bins.size)
    val specIm = DoubleArray(bins.size)

    init {
        val (f0, f1) = if (rising) band.lo to band.hi else band.hi to band.lo
        val span = L.toDouble() / FS
        val edge = 0.2 * L / 2
        for (i in 0 until L) {
            val t = i.toDouble() / FS
            val w = when {
                i < edge -> 0.5 * (1 - cos(PI * i / edge))
                i > L - 1 - edge -> 0.5 * (1 - cos(PI * (L - 1 - i) / edge))
                else -> 1.0
            }
            wave[i] = (0.9 * w * sin(2 * PI * (f0 * t + (f1 - f0) * t * t / (2 * span)))).toFloat()
        }
        val fr = DoubleArray(P) { wave[it].toDouble() }
        val fi = DoubleArray(P)
        Fft(P).run(fr, fi)
        for (m in bins.indices) {
            val w = sin(PI * (m + 0.5) / bins.size).let { it * it }
            specRe[m] = w * fr[bins[m]]
            specIm[m] = w * fi[bins[m]]
        }
    }
}

data class Peak(val at: Double, val db: Double)

class Track(probe: Probe) {
    var last: Double? = null
        private set
    private val omega = DoubleArray(probe.bins.size) { 2 * PI * probe.bins[it] / P }
    private val mid: Double
    private var turnRe = 0.0
    private var turnIm = 0.0
    private var seen = 0
    var lastPhase = 0.0
        private set
    var usualPhase = 0.0
        private set

    init {
        var sw = 0.0
        var sk = 0.0
        for (m in probe.bins.indices) {
            val w = probe.specRe[m] * probe.specRe[m] + probe.specIm[m] * probe.specIm[m]
            sw += w
            sk += w * omega[m]
        }
        mid = sk / sw
    }

    val steady get() = seen >= SETTLE
    var off = 0.0
        private set

    fun lose() {
        last = null
    }

    fun find(cRe: DoubleArray, cIm: DoubleArray, power: DoubleArray, floor: Double, rRe: DoubleArray, rIm: DoubleArray, avoid: Double? = null): Peak? {
        var top = -1
        var best = -1
        val near = last
        for (j in 0 until P) {
            if (avoid != null && abs(wrapHalf(j - avoid)) < GUARD) continue
            if (top < 0 || power[j] > power[top]) top = j
            if (near != null && abs(wrapHalf(j - near)) <= 16 && (best < 0 || power[j] > power[best])) best = j
        }
        if (top < 0) return null
        if (best < 0 || power[best] < power[top] / 4) best = top
        val ground = if (avoid == null) floor else quiet(power, avoid)
        val db = 10 * log10(max(power[best], 1e-30) / max(ground, 1e-30))
        if (db < HEARD_DB) {
            last = null
            return Peak(best.toDouble(), db)
        }
        val at = wrapP(fine(rRe, rIm, best.toDouble()))
        last = at
        return Peak(at, db)
    }

    private val rest = DoubleArray(P)

    private fun quiet(power: DoubleArray, avoid: Double): Double {
        var n = 0
        for (j in 0 until P) if (abs(wrapHalf(j - avoid)) > GUARD) rest[n++] = power[j]
        java.util.Arrays.sort(rest, 0, n)
        return if (n > 0) rest[n / 2] else 0.0
    }

    private fun fine(rRe: DoubleArray, rIm: DoubleArray, start: Double): Double {
        var t = start
        var cr = 0.0
        var ci = 0.0
        repeat(5) {
            cr = 0.0; ci = 0.0
            var dr = 0.0; var di = 0.0
            var er = 0.0; var ei = 0.0
            for (m in omega.indices) {
                val w = omega[m]
                val c = cos(w * t)
                val s = sin(w * t)
                val vr = rRe[m] * c - rIm[m] * s
                val vi = rRe[m] * s + rIm[m] * c
                cr += vr; ci += vi
                dr -= w * vi; di += w * vr
                er -= w * w * vr; ei -= w * w * vi
            }
            val slope = cr * dr + ci * di
            val bend = dr * dr + di * di + cr * er + ci * ei
            if (bend >= 0) return@repeat
            t -= (slope / bend).coerceIn(-0.5, 0.5)
        }
        val phase = atan2(ci, cr)
        if (seen < SETTLE) {
            seen++
            turnRe += (cos(phase) - turnRe) / seen
            turnIm += (sin(phase) - turnIm) / seen
        }
        val usual = atan2(turnIm, turnRe)
        lastPhase = phase
        usualPhase = usual
        off = turn(phase - usual)
        return t - off / mid
    }

    companion object {
        const val HEARD_DB = 16.0
        const val SETTLE = 128
        const val GUARD = L
    }
}

private fun turn(d: Double): Double {
    var v = d
    while (v > PI) v -= 2 * PI
    while (v < -PI) v += 2 * PI
    return v
}

class Matcher(private val own: Probe, private val other: Probe) {
    private val fft = Fft(P)
    private val yRe = DoubleArray(P)
    private val yIm = DoubleArray(P)
    val ownRe = DoubleArray(P)
    val ownIm = DoubleArray(P)
    val otherRe = DoubleArray(P)
    val otherIm = DoubleArray(P)
    val ownPower = DoubleArray(P)
    val otherPower = DoubleArray(P)
    val ownRRe = DoubleArray(own.bins.size)
    val ownRIm = DoubleArray(own.bins.size)
    val otherRRe = DoubleArray(other.bins.size)
    val otherRIm = DoubleArray(other.bins.size)
    var ownFloor = 0.0
    var otherFloor = 0.0
    private val sorted = DoubleArray(P)

    fun match(frame: FloatArray) {
        for (j in 0 until P) { yRe[j] = frame[j].toDouble(); yIm[j] = 0.0 }
        fft.run(yRe, yIm)
        ownFloor = matchOne(own, ownRe, ownIm, ownPower, ownRRe, ownRIm)
        otherFloor = matchOne(other, otherRe, otherIm, otherPower, otherRRe, otherRIm)
    }

    private fun matchOne(p: Probe, re: DoubleArray, im: DoubleArray, power: DoubleArray, rRe: DoubleArray, rIm: DoubleArray): Double {
        java.util.Arrays.fill(re, 0.0)
        java.util.Arrays.fill(im, 0.0)
        for (m in p.bins.indices) {
            val k = p.bins[m]
            rRe[m] = (yRe[k] * p.specRe[m] + yIm[k] * p.specIm[m]) / P
            rIm[m] = (yIm[k] * p.specRe[m] - yRe[k] * p.specIm[m]) / P
            re[k] = rRe[m] * P
            im[k] = rIm[m] * P
        }
        fft.run(re, im, inverse = true)
        for (j in 0 until P) {
            power[j] = re[j] * re[j] + im[j] * im[j]
            sorted[j] = power[j]
        }
        sorted.sort()
        return sorted[P / 2]
    }
}
