class MockCurrentScript {
  attributes = [];

  replaceWith(script) {
    swerve.ready = _ => {};
    script.dispatchEvent(new Event('load'));
  }
}

Object.defineProperty(document, 'currentScript', {
  value: new MockCurrentScript()
});