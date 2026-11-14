package dev.obayy.earlyecho

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AirTest {
    @Test
    fun speedAndTemperatureAgree() {
        assertEquals(343.21, Air.speedAt(20.0), 0.01)
        for (c in listOf(-10.0, 0.0, 20.0, 35.0)) assertEquals(c, Air.celsius(Air.speedAt(c)), 1e-9)
    }

    @Test
    fun theSumGivesBackTheDistanceAndSpeed() {
        val c = Air.speedAt(20.0)
        val sum = (2 * 1.0 / c - 2 * Air.SELF) * 1e6
        assertEquals(1.0, Air.distance(c, sum), 1e-12)
        assertEquals(c, Air.speed(1.0, sum), 1e-9)
        assertEquals(4.43, 2 * 0.00076 / c * 1e6, 0.01)
        assertEquals(9.91, sum - (2 * 1.0 / Air.speedAt(21.0) - 2 * Air.SELF) * 1e6, 0.01)
    }
}
