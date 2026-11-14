package app.couchtv.launcher

import org.junit.Assert.assertEquals
import org.junit.Test

class IconBoundsTest {
    @Test fun primeLandscapeBannerKeepsSixteenByNineProportions() {
        assertEquals(IconBounds(0, 56, 256, 200), IconBounds.fit(320, 180, 256))
    }
    @Test fun portraitArtworkIsCentered() {
        assertEquals(IconBounds(64, 0, 192, 256), IconBounds.fit(100, 200, 256))
    }
    @Test fun squareLogoFillsTheSquare() {
        assertEquals(IconBounds(0, 0, 256, 256), IconBounds.fit(512, 512, 256))
    }
    @Test fun drawableWithoutIntrinsicDimensionsStillDraws() {
        assertEquals(IconBounds(0, 0, 256, 256), IconBounds.fit(-1, -1, 256))
    }
    @Test fun extremeAspectRatioRetainsAtLeastOnePixel() {
        assertEquals(IconBounds(0, 127, 256, 128), IconBounds.fit(100000, 1, 256))
    }
}
