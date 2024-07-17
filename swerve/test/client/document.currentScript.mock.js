class MockCurrentScript {
  static calls = { replaceWith: [] };

  attributes = [];

  replaceWith(script) {
    MockCurrentScript.calls.replaceWith.push([...arguments]);
    swerve.ready = _ => {};
    script.dispatchEvent(new Event('load'));
  }
}

Object.defineProperty(document, 'currentScript', {
  value: new MockCurrentScript()
});