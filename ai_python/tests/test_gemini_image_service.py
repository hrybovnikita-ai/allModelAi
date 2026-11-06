from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from services import gemini_image_service as gis


class GeminiImageServiceTests(unittest.TestCase):
    def test_verify_not_configured(self):
        with patch.dict("os.environ", {}, clear=True):
            out = gis.verify_gemini_image_access()
            self.assertFalse(out["ok"])
            self.assertEqual(out["code"], "GEMINI_NOT_CONFIGURED")

    def test_generate_returns_prompt_error_without_client(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}, clear=False):
            with patch.object(gis, "verify_gemini_image_access", return_value={"ok": True}):
                out = gis.generate_flash_lite_image("   ")
                self.assertFalse(out["ok"])
                self.assertEqual(out["code"], "INVALID_PROMPT")

    def test_generate_maps_client_exception_to_rate_limit(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}, clear=False):
            with patch.object(gis, "verify_gemini_image_access", return_value={"ok": True}):
                mock_client = MagicMock()
                mock_client.models.generate_content.side_effect = Exception("HTTP 429 resource exhausted")
                with patch.object(gis, "_get_client", return_value=mock_client):
                    out = gis.generate_flash_lite_image("a red apple on a table")
                    self.assertFalse(out["ok"])
                    self.assertEqual(out["code"], "GEMINI_RATE_LIMIT")


if __name__ == "__main__":
    unittest.main()
