package app.couchtv.launcher

import kotlin.math.roundToInt

/** Fit artwork inside a square without stretching landscape TV banners into tall logos. */
internal data class IconBounds(val left: Int, val top: Int, val right: Int, val bottom: Int) {
    companion object {
        fun fit(width: Int, height: Int, size: Int): IconBounds {
            val w = if (width > 0) width else size
            val h = if (height > 0) height else size
            val scale = minOf(size.toFloat() / w, size.toFloat() / h)
            val fittedWidth = (w * scale).roundToInt().coerceIn(1, size)
            val fittedHeight = (h * scale).roundToInt().coerceIn(1, size)
            val left = (size - fittedWidth) / 2
            val top = (size - fittedHeight) / 2
            return IconBounds(left, top, left + fittedWidth, top + fittedHeight)
        }
    }
}
