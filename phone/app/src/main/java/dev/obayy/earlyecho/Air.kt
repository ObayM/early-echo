package dev.obayy.earlyecho

import kotlin.math.sqrt

object Air {
    const val SELF = 0.0003

    fun speedAt(celsius: Double) = 331.3 * sqrt(1 + celsius / 273.15)

    fun celsius(speed: Double) = 273.15 * ((speed / 331.3) * (speed / 331.3) - 1)

    fun speed(metres: Double, sumUs: Double) = 2 * metres / (sumUs * 1e-6 + 2 * SELF)

    fun distance(speed: Double, sumUs: Double) = speed * (sumUs * 1e-6 + 2 * SELF) / 2
}
