"""Model Lab training — real gradient descent metrics."""

from learning.logistic_regression.torch_logistic import train_logistic_regression
from learning.neural_network.torch_mlp import train_neural_network
from learning.pytorch.linear_torch import train_pytorch_linear


def test_linear_regression_learns_approx_3x_plus_2():
    out = train_pytorch_linear(epochs=80, learning_rate=0.05, seed=7, data_points=120, batch_size=32)
    assert out["ok"]
    assert out["finalLoss"] < 0.5
    assert 2.0 < out["finalWeight"] < 4.0
    assert 1.0 < out["finalBias"] < 3.5
    assert len(out["lossHistory"]) == 80
    assert len(out["validationLossHistory"]) == 80
    assert out["lossHistory"][-1] <= out["lossHistory"][0]


def test_logistic_regression_trains():
    out = train_logistic_regression(epochs=100, learning_rate=0.15, seed=3, data_points=200)
    assert out["ok"]
    assert out["finalAccuracy"] >= 0.5
    assert len(out["lossHistory"]) == 100
    assert out["lossHistory"][-1] < out["lossHistory"][0]


def test_neural_network_trains():
    out = train_neural_network(epochs=30, learning_rate=0.02, seed=1, data_points=90)
    assert out["ok"]
    assert out["finalAccuracy"] > 0.5


def test_invalid_epochs_clamped():
    out = train_pytorch_linear(epochs=2, learning_rate=0.01, seed=1, data_points=40)
    assert out["epochs"] >= 5
