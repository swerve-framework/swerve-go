// This is the Swerve installation script. It lives in the same path as the
// client library, which the service worker serves in its place once installed.
(_ => {
  class Swerve {
    static #this = self.swerve = new Swerve();
    static #ready = new Promise(async resolve => {
      const STATUS_COOKIE_NAME = "swerve.installed";
      const script = document.currentScript;
    
      navigator.serviceWorker.addEventListener("controllerchange", _ => {
        const newScript = document.createElement("script");
        const attrs = new Array(...script.attributes);
        attrs.forEach(attr => newScript.setAttribute(attr.name, attr.value));
        newScript.addEventListener("load", async _ => {
          await self.swerve.ready();
          resolve();
        });
        script.replaceWith(newScript);
      });
    
      navigator.serviceWorker.register("/swerve.bootstrap.js", { scope: "/" });
      await navigator.serviceWorker.ready;
    
      document.cookie = `${STATUS_COOKIE_NAME}=true; Expires=${
          new Date(new Date().setFullYear(new Date().getFullYear() + 100))
        }`;
      
      const config = await (await fetch("/swerve.config.json")).json();
      if (!config.noReloadOnInstall) {
        // instead of location.reload() we use location.replace(location); this
        // fixes broken behavior in Chrome, where if you only reload, a
        // subsequent reload would cause the service worker to lose control
        location.replace(location); 
      }
    });

    async ready() {
      return await Swerve.#ready;
    }
  }

})();