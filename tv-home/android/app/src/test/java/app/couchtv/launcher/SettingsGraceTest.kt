package app.couchtv.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SettingsGraceTest {
    @Before fun begin() { FireWatch.allowSettingsNow(100L) }

    @Test fun actualSettingsEndsTheEntryGrace() {
        assertTrue(FireWatch.settingsAllowed(101L))
        FireWatch.settingsWindowShown(FireWatch.AMAZON_HOME, FireWatch.AMAZON_SETTINGS)
        assertFalse(FireWatch.settingsAllowed(101L))
    }

    @Test fun intermediateHomeDoesNotEndTheEntryGrace() {
        FireWatch.settingsWindowShown(FireWatch.AMAZON_HOME, "${FireWatch.AMAZON_HOME}.ui.HomeActivity_vNext")
        assertTrue(FireWatch.settingsAllowed(101L))
    }

    @Test fun separateAmazonSettingsPackageEndsTheEntryGrace() {
        FireWatch.settingsWindowShown("com.amazon.tv.settings.v2", "com.amazon.tv.settings.v2.SettingsActivity")
        assertFalse(FireWatch.settingsAllowed(101L))
    }

    @Test fun unrelatedAndUnknownWindowsCannotEndTheEntryGrace() {
        FireWatch.settingsWindowShown("video.example", "video.example.SettingsActivity")
        FireWatch.settingsWindowShown(FireWatch.AMAZON_HOME, "android.widget.FrameLayout")
        FireWatch.settingsWindowShown("com.amazon.tv.settingsimpostor", "SettingsActivity")
        FireWatch.settingsWindowShown(null, null)
        assertTrue(FireWatch.settingsAllowed(101L))
    }

    @Test fun ignoredHomeHasABoundedRecheckDelay() {
        assertEquals(8000L, FireWatch.settingsGraceRemaining(100L))
        assertEquals(1L, FireWatch.settingsGraceRemaining(8099L))
        assertEquals(0L, FireWatch.settingsGraceRemaining(8100L))
        assertEquals(0L, FireWatch.settingsGraceRemaining(9000L))
    }

    @Test fun actualSettingsRemovesTheRecheckDelay() {
        FireWatch.settingsWindowShown(FireWatch.AMAZON_HOME, FireWatch.AMAZON_SETTINGS)
        assertEquals(0L, FireWatch.settingsGraceRemaining(101L))
    }

    @Test fun graceExpiresAtItsOriginalDeadline() {
        assertTrue(FireWatch.settingsAllowed(8099L))
        assertFalse(FireWatch.settingsAllowed(8100L))
    }
}
