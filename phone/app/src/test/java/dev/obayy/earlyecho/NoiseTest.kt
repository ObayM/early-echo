package dev.obayy.earlyecho

import org.junit.jupiter.api.Test
import java.util.Random
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

class NoiseTest {
    @Test
    fun still() {
        val own = Probe(Band.HIGH, true)
        val other = Probe(Band.HIGH, false)
        val fft = Fft(P)
        val sr = DoubleArray(P) { other.wave[it].toDouble() }
        val si = DoubleArray(P)
        fft.run(sr, si)
        val m = Matcher(own, other)
        val rnd = Random(3)
        for (noise in listOf(0.01, 0.05, 0.1)) {
            val track = Track(other)
            val means = ArrayList<String>()
            var sum = 0.0
            var n = 0
            var dbs = 0.0
            for (f in 0 until 1328) {
                val pos = 1100.37
                val re = DoubleArray(P)
                val im = DoubleArray(P)
                for (k in 0 until P) {
                    val q = if (k <= P / 2) k else k - P
                    val a = -2 * PI * q * pos / P
                    re[k] = 0.08 * (sr[k] * cos(a) - si[k] * sin(a))
                    im[k] = 0.08 * (sr[k] * sin(a) + si[k] * cos(a))
                }
                fft.run(re, im, inverse = true)
                val frame = FloatArray(P) { (re[it] + noise * rnd.nextGaussian()).toFloat() }
                m.match(frame)
                val pk = track.find(m.otherRe, m.otherIm, m.otherPower, m.otherFloor, m.otherRRe, m.otherRIm)!!
                if (f < Track.SETTLE) continue
                sum += (pk.at - pos) * US_PER_SAMPLE
                dbs += pk.db
                n++
                if (n == 100) { means += "%.2f".format(sum / n); sum = 0.0; n = 0 }
            }
            println("noise $noise (about %.0f dB): mean error per 100 periods, µs: ${means.joinToString(" ")}".format(dbs / 1200))
        }
    }
}
