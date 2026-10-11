from engine.audit import build_engine_audit


def test_engine_audit_lists_five_systems():
    audit = build_engine_audit()
    assert audit["phase"] == 1
    assert "neural_network_engine" in audit["systems"]
    assert "prompt_intelligence" in audit["systems"]
    assert "semantic_memory" in audit["systems"]
    assert "answer_quality_analyzer" in audit["systems"]
    assert "training_studio" in audit["systems"]
    assert isinstance(audit["test_modules"], list)
