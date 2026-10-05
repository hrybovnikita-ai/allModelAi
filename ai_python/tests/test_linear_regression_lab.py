"""Unit tests for NumPy linear regression lab."""

from __future__ import annotations

import unittest

from lessons.linear_regression_lab import train_linear_regression


class LinearRegressionLabTests(unittest.TestCase):
    def test_training_reduces_loss(self):
        result = train_linear_regression(
            learning_rate=0.01,
            epochs=800,
            initial_weight=0.0,
            initial_bias=0.0,
            seed=7,
        )
        self.assertTrue(result["ok"])
        history = result["history"]
        self.assertGreaterEqual(len(history), 2)
        self.assertLess(result["finalLoss"], history[0]["loss"])
        self.assertAlmostEqual(result["finalWeight"], result["trueWeight"], delta=0.5)
        self.assertAlmostEqual(result["finalBias"], result["trueBias"], delta=0.6)


if __name__ == "__main__":
    unittest.main()
