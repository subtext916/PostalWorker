/**
 * Public API methods for module
 * This is where all the methods which are attached to the prototype of the module are defined and configured
 * @author: Russ Stratfull
 */
import * as S from "./strings";

export class PublicApi {
  /**
   * Primary PostalWorker public methods
   * @param {*} module
   */
  static rootMethods(module) {
    module.on = (msgClass, action) => module._on(msgClass, action);
    module.on.example = `PostalWorker().on('example', (msg) => console.info(msg))`;

    module.un = msgClass => module._un(msgClass);
    module.un.example = `PostalWorker().un('example')`;

    module.fire = (msgClass, msg, audience) =>
      module._fire(msgClass, msg, audience);
    module.fire.example = `PostalWorker().fire('example', 'Hello world')`;

    module.crossOn = (msgClass, action, subscriber, name, windowparams) =>
      module._crossOn(msgClass, action, subscriber, name, windowparams);
    module.crossOn.example = `PostalWorker().crossOn('example', (msg) => console.info(msg), 'http://example.com', 'Example Name', )`;

    module.unCross = (msgClass, subscriber) =>
      module._unCross(msgClass, subscriber);
    module.unCross.example = `PostalWorker().unCross('example', 'http://example.com')`;

    module.crossFire = (msgClass, msg) => module._crossFire(msgClass, msg);
    module.crossFire.example = `PostalWorker().crossFire('example', 'message to all windows/tabs cross launched')`;

    module.fireAll = (msgClass, msg) => module._fireAll(msgClass, msg);
    module.fireAll.example = `PostalWorker().fireAll('example', 'message to ALL windows/tabs/workers')`;

    module.load = library => module._load(library);
    module.load.example = `PostalWorker().load('path/to/script.js')`;

    module.postBox = (address, callback) => module._postBox(address, callback);
    module.postBox.example = `PostalWorker().PObox('example', function(value) { console.log(value); })`;

    module.post = (address, value) => module._post(address, value);
    module.post.example = `PostalWorker().post('example', 'This is an example value')`;

    module.closeBox = address => module._closeBox(address);
    module.closeBox.example = `PostalWorker().closeBox("example")`;

    module.package = (address, handling) => module._package(address, handling);
    module.package.example = `PostalWorker().package('example', (todo) => {})`;

    module.pack = (address, content) => module._pack(address, content);
    module.pack.example = `PostalWorker().pack('example', 'url/of/file.jpg')`;
  }

  /**
   * Special method added when script detects that the current window is an iframe
   * @param {*} module
   */
  static backMethod(module) {
    module.backFire = (msgClass, msg) => module._backFire(msgClass, msg);
    module.backFire.example = `PostalWorker().backfire('example', 'Message to parent window')`;
  }

  /**
   * Utility methods which in the future could maybe be removed from public access
   * @param {*} module
   */
  static utilityMethods(module) {
    // module.getAddress = () => module._getAddress();
    // module.getAddress.example = `PostalWorker().getAddress()`;
    // module.getPostalRoute = () => module._getPostalRoute();
    // module.getPostalRoute.example = `PostalWorker().getPostalRoute()`;
    // module.getCrossEvents = () => module._getCrossEvents();
    // module.getCrossEvents.example = `PostalWorker().getCrossEvents()`;
    // module.getEvents = () => module._getEvents();
    // module.getEvents.example = `PostalWorker().getEvents()`;
    // module.getSubscriber = url => module._getSubscriber(url);
    // module.getSubscriber.example = `PostalWorker().getSubscriber('http://example.com')`;
    // module.getSubscriptions = () => module._getSubscriptions();
    // module.getSubscriptions.example = `PostalWorker().getSubscriptions()`;
    // module.getWindows = () => module._getWindows();
    // module.getWindows.example = `PostalWorker().getWindows()`;
    // module.getWindowsBySubscriber = subscriber =>
    //   module._getWindowsBySubscriber(subscriber);
    // module.getWindowsBySubscriber.example = `PostalWorker().getWindowsBySubscriber('http://example.com')`;
    // module.uniqueNumber = () => module._uniqueNumber();
  }

  /**
   * Attach global window event handlers needed by PostalWorker
   * @param {*} module
   */
  static attachHandlers(module) {
    // Beforewindow unloads, announce disconnect to community
    window.addEventListener("beforeunload", () => {
      const mod = module;
      mod._unmapFromBroadcastNetwork(mod.id);
      mod._fireAll(S.DISCONNECT, {
        id: mod.id,
        subscriber: mod._getSubscriber(window.location.href)
      });
    });

    // When window loads, announce connection to community
    window.addEventListener("load", () => {
      const mod = module;
      mod._fireAll(S.CONNECT, {
        id: mod.id,
        subscriber: mod._getSubscriber(window.location.href)
      });
    });
  }

  /**
   * Establish internal usage of PostalWorker to create connect, disconnect, msgClasses
   * @param {*} module
   */
  static internalSubscriptions(module) {
    // Connect
    module._on(S.CONNECT, msg => {
      // console.info("CONNECT", msg);
      const mod = module;
      mod._mapToBroadcastNetwork(msg.id);
    });
    module._crossOn(S.CONNECT, msg => {
      // console.info("crossOn CONNECT", msg);
      const mod = module;
      let wins = mod._getOpeningWindows(); //.get(msg.subscriber);
      let mapped = [];
      if (wins) {
        // wins.size should be 1 but todo: support multiple?
        for (let [subscriber, win] of wins) {
          mod._mapToWindow(msg.id, win, msg.subscriber);
          mapped.push(subscriber);
        }
        for (let m of mapped) {
          mod._getOpeningWindows().delete(m);
        }
      }
    });

    // Disconnect
    module._on(S.DISCONNECT, msg => {
      // console.info("DISCONNECT", msg);
      const mod = module;
      mod._unmapFromWindow(msg.id);
    });
    module._crossOn(S.DISCONNECT, msg => {
      // console.info("crossOn: DISCONNECT", msg);
      const mod = module;
      mod._unmapFromWindow(msg.id);
    });
  }

  /**
   * Subscribe to postbox collection msgClass to get updates
   * @param {*} module
   */
  static registerCollection(module) {
    // let last;
    module._on(S.COLLECT, msg => {
      const mod = module;
      // const serialized = JSON.stringify(msg);
      //if (last !== serialized) {
      mod._collectBox(msg);
      // }
      // last = serialized;
    });
  }

  /**
   * Unregister postbox collection msgClass
   * @param {*} module
   */
  static unregisterCollection(module) {
    module._un(S.COLLECT);
  }

  /**
   * Register for temporary msgClass to get final update when postbox is being closed
   * @param {*} module
   * @param {*} add
   * @param {*} collect
   */
  static registerClosure(module, add, collect) {
    const lastCollection = collect;
    if (!module.getEvents().get(S.BOXCLOSED)) {
      module._on(S.BOXCLOSED, msg => {
        const mod = module;
        mod._clearBox(msg);

        // todo: remove boxclosed subscription if not needed anymore
        // mod._un(S.BOXCLOSED);
      });
    }

    module._lastCollection(add, lastCollection);
  }

  /**
   * Register for msgClass to receive package updates and deliver them
   * @param {*} module
   */
  static registerDelivery(module) {
    module._on(S.DELIVERY, msg => {
      const mod = module;
      mod._delivery(msg);
    });
    // todo: handle unregister
  }
}
