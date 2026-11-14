package dev.obayy.earlyecho

import org.junit.jupiter.api.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

class FinePlaceTest {
    private fun at(p: Probe, spec: Pair<DoubleArray, DoubleArray>, pos: Double, re: DoubleArray, im: DoubleArray, gain: Double) {
        for (k in 0 until P) {
            val f = if (k <= P / 2) k else k - P
            val ang = -2 * PI * f * pos / P
            re[k] += gain * (spec.first[k] * cos(ang) - spec.second[k] * sin(ang))
            im[k] += gain * (spec.first[k] * sin(ang) + spec.second[k] * cos(ang))
        }
    }

    @Test
    fun linear() {
        val own = Probe(Band.HIGH, true)
        val other = Probe(Band.HIGH, false)
        val fft = Fft(P)
        fun spec(p: Probe): Pair<DoubleArray, DoubleArray> { val r = DoubleArray(P) { p.wave[it].toDouble() }; val i = DoubleArray(P); fft.run(r, i); return r to i }
        val so = spec(own)
        val sx = spec(other)
        val m = Matcher(own, other)
        for (withOwn in listOf(false, true)) {
            val track = Track(other)
            var worst = 0.0
            val line = StringBuilder()
            for (step in 0..40) {
                val pos = 1100.0 + step * 0.05
                val re = DoubleArray(P)
                val im = DoubleArray(P)
                at(other, sx, pos, re, im, 0.08)
                if (withOwn) { at(own, so, 76.3, re, im, 1.0); at(own, so, 76.3 + 100.8, re, im, 0.15) }
                fft.run(re, im, inverse = true)
                val frame = FloatArray(P) { re[it].toFloat() }
                m.match(frame)
                val pk = track.find(m.otherRe, m.otherIm, m.otherPower, m.otherFloor, m.otherRRe, m.otherRIm, avoid = if (withOwn) 76.3 else null)!!
                val err = (pk.at - pos) * US_PER_SAMPLE
                if (step >= 10) worst = max(worst, abs(err - 0.0))
                if (step % 4 == 0) line.append("%.2f:%.3f ".format(pos - 1100, err))
            }
            println("own chirp ${if (withOwn) "on" else "off"}: error in µs by fraction of a sample: $line")
        }
    }
}
