QUnit.test('swerve calls navigator.serviceWorker.register', async assert => {
  assert.equal(MockServiceWorker.calls.register.length, 1,
    "navigator.serviceWorker.register is called exactly once");
  assert.deepEqual(MockServiceWorker.calls.register[0],
    [ "/swerve.bootstrap.js", { scope: "/" } ],
    "navigator.serviceWorker.register is called with the correct arguments");
});

QUnit.test('swerve does not set any cookies initially', async assert => {
  assert.equal(document.cookie, '', 'document.cookie is empty');
});

QUnit.test('swerve.ready() resolves after controllerchange', async assert => {
  navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  await swerve.ready();
  assert.equal(document.cookie, 'swerve.installed=true',
    'the swerve.installed cookie is set');
});
