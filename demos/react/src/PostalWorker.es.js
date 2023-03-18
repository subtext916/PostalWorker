/* eslint-disable */
/**
 * PostalWorker String Constants
 * @type {string}
 */
function throwsMessage(e){return"[Throws: "+(e?e.message:"?")+"]"}function safeGetValueFromPropertyOnObject(e,s){if(hasProp.call(e,s))try{return e[s]}catch(e){return throwsMessage(e)}return e[s]}function ensureProperties(e){// store references to objects we have seen before
function s(e){if(null===e||"object"!=typeof e)return e;if(-1!==t.indexOf(e))return"[Circular]";if(t.push(e),"function"==typeof e.toJSON)try{var n=s(e.toJSON());return t.pop(),n}catch(e){return throwsMessage(e)}if(Array.isArray(e)){var o=e.map(s);return t.pop(),o}var r=Object.keys(e).reduce(function(t,n){
// prevent faulty defined getter properties
return t[n]=s(safeGetValueFromPropertyOnObject(e,n)),t},{});return t.pop(),r}var t=[];return s(e)}function main(e){return _PostalWorker||(_PostalWorker=new PostalWorker(e,index))}const POSTAL_WORKER="PostalWorker",POSTAL_SHARED_WORKER="PostalSharedWorker",ON="ON",UN="UN",FIRE="FIRE",CROSSFIRE="CROSSFIRE",BACKFIRE="BACKFIRE",CHILDREGISTER="CHILDREGISTER",WORKERREGISTER="WORKERREGISTER",REGISTERID="REGISTERID",UNREGISTERID="UNREGISTERID",BROADCASTNODE="BROADCASTNODE",CROSSNODE="CROSSNODE",ERROR="ERROR",MESSAGE="message",SCRIPT="script",JS="js",LOAD="LOAD",RESPONSE="RESPONSE",SET_ADDRESS="SET_ADDRESS",CONNECT="CONNECT",DISCONNECT="DISCONNECT",POBOX="POBOX",POST="POST",COLLECT="COLLECT",CLOSEBOX="CLOSEBOX",BOXCLOSED="BOXCLOSED",PACKAGE="PACKAGE",PACK="PACK",DELIVERY="DELIVERY",_BLANK="_blank";class Deprecated{static registerWorker(e,s,t,n){e.port.onmessage=(e=>{
// Handle messages sent from worker by type
switch(e.data.type){case FIRE:// If the legacy messaging is used, it will still work here
// Send the message
e.data.data.msgClass&&t.get(e.data.data.msgClass)&&t.get(e.data.data.msgClass)(e.data.data.message),
// Let worker know message was received
e.currentTarget.postMessage(s);break;case SET_ADDRESS:Deprecated.address=e.data.data;break;case ERROR:console.error(e.data.data);break;default:console.warn(e)}})}}/**
 * Postal Helper defines the public API methods and creates window event handlers
 * for the postal worker and add/remove internal postal subscriptions used by the library
 * @author: Russ Stratfull
 */
class PostalHelper{/**
   * Primary PostalWorker public methods
   * @param {*} module
   */
static rootMethods(e){e.on=((s,t)=>e._on(s,t)),e.on.example=`PostalWorker().on('example', (msg) => console.info(msg))`,e.un=(s=>e._un(s)),e.un.example=`PostalWorker().un('example')`,e.fire=((s,t,n)=>e._fire(s,t,n)),e.fire.example=`PostalWorker().fire('example', 'Hello world')`,e.crossOn=((s,t,n,o,r)=>e._crossOn(s,t,n,o,r)),e.crossOn.example=`PostalWorker().crossOn('example', (msg) => console.info(msg), 'http://example.com', 'Example Name', )`,e.unCross=((s,t)=>e._unCross(s,t)),e.unCross.example=`PostalWorker().unCross('example', 'http://example.com')`,e.crossFire=((s,t)=>e._crossFire(s,t)),e.crossFire.example=`PostalWorker().crossFire('example', 'message to all windows/tabs cross launched')`,e.fireAll=((s,t)=>e._fireAll(s,t)),e.fireAll.example=`PostalWorker().fireAll('example', 'message to ALL windows/tabs/workers')`,e.load=(s=>e._load(s)),e.load.example=`PostalWorker().load('path/to/script.js')`,e.postBox=((s,t)=>e._postBox(s,t)),e.postBox.example=`PostalWorker().PObox('example', function(value) { console.log(value); })`,e.post=((s,t)=>e._post(s,t)),e.post.example=`PostalWorker().post('example', 'This is an example value')`,e.closeBox=(s=>e._closeBox(s)),e.closeBox.example=`PostalWorker().closeBox("example")`,e.package=((s,t)=>e._package(s,t)),e.package.example=`PostalWorker().package('example', (todo) => {})`,e.pack=((s,t)=>e._pack(s,t)),e.pack.example=`PostalWorker().pack('example', 'url/of/file.jpg')`}/**
   * Special method added when script detects that the current window is an iframe
   * @param {*} module
   */
static backMethod(e){e.backFire=((s,t)=>e._backFire(s,t)),e.backFire.example=`PostalWorker().backfire('example', 'Message to parent window')`}/**
   * Utility methods which in the future could maybe be removed from public access
   * @param {*} module
   */
static utilityMethods(e){}/**
   * Attach global window event handlers needed by PostalWorker
   * @param {*} module
   */
static attachHandlers(e){
// Beforewindow unloads, announce disconnect to community
window.addEventListener("beforeunload",()=>{const s=e;s._unmapFromBroadcastNetwork(s.id);s._fireAll(DISCONNECT,{id:s.id,subscriber:s._getSubscriber(window.location.href)})}),
// When window loads, announce connection to community
window.addEventListener("load",()=>{const s=e;s._fireAll(CONNECT,{id:s.id,subscriber:s._getSubscriber(window.location.href)})})}/**
   * Establish internal usage of PostalWorker to create connect, disconnect, msgClasses
   * @param {*} module
   */
static internalSubscriptions(e){
// Connect
e._on(CONNECT,s=>{
// console.info("CONNECT", msg);
const t=e;t._mapToBroadcastNetwork(s.id)}),e._crossOn(CONNECT,s=>{
// console.info("crossOn CONNECT", msg);
const t=e;let n=t._getOpeningWindows();//.get(msg.subscriber);
let o=[];if(n){
// wins.size should be 1 but todo: support multiple?
for(let[e,r]of n)t._mapToWindow(s.id,r,s.subscriber),o.push(e);for(let e of o)t._getOpeningWindows().delete(e)}}),
// Disconnect
e._on(DISCONNECT,s=>{
// console.info("DISCONNECT", msg);
const t=e;t._unmapFromWindow(s.id)}),e._crossOn(DISCONNECT,s=>{
// console.info("crossOn: DISCONNECT", msg);
const t=e;t._unmapFromWindow(s.id)})}/**
   * Subscribe to postbox collection msgClass to get updates
   * @param {*} module
   */
static registerCollection(e){
// let last;
e._on(COLLECT,s=>{const t=e;
// const serialized = JSON.stringify(msg);
//if (last !== serialized) {
t._collectBox(s)})}/**
   * Unregister postbox collection msgClass
   * @param {*} module
   */
static unregisterCollection(e){e._un(COLLECT)}/**
   * Register for temporary msgClass to get final update when postbox is being closed
   * @param {*} module
   * @param {*} add
   * @param {*} collect
   */
static registerClosure(e,s,t){const n=t;e._getEvents().get(BOXCLOSED)||e._on(BOXCLOSED,s=>{const t=e;t._clearBox(s)}),e._lastCollection(s,n)}/**
   * Register for msgClass to receive package updates and deliver them
   * @param {*} module
   */
static registerDelivery(e){e._on(DELIVERY,s=>{const t=e;t._delivery(s)})}}/**
 * PostalWorker Post Messenger Event Bus Module (ES6)
 * @description: Listen for and broadcast out messages by "message class"
 * between windows/tabs & web workers using the postMessage API
 * @Author: Russ Stratfull
 * @Contributors: Sakshi Dheer, & François Wauquier
 */
// todo: Research how to implement this polyfill: https://github.com/okikio/sharedworker
// import SharedWorkerPolyfill from "./SharedWorkerPolyfill";
let _config=!1,_stringify,_worker=!1,_parentWindow=!1,_subscriptions=new Set,_events=new Map,_crossEvents=new Map,_openingWindows=new Map,_windows=new Map,_broadcastNetwork=new Set,_channel=new BroadcastChannel(POSTAL_WORKER),_queue=[],_POboxes=new Map,_closures=new Map,_packages=new Map;
// Define the PostalWorker
class PostalWorker{/**
   * Initialize object with configuration & setup the worker and listeners
   * @param configuration
   * @param safeJsonStringify
   */
constructor(e,s){this.uniqueNumber=0,this.id=this._uniqueNumber(),this.workerOnline=!1,_config=e||!1,_stringify=s,
// Public API
PostalHelper.rootMethods(this),PostalHelper.utilityMethods(this),
// Attach global handlers
PostalHelper.attachHandlers(this),
// Does this window have a parent?
window.self!==window.top&&(
// If it does, include additional public methods and then register it
// and let it know this window is ready to receive messages
PostalHelper.backMethod(this),_parentWindow=this._getSubscriber(document.referrer),this._backFire(CHILDREGISTER)),
// Add event listener to incoming messages (from windows) and process with messageController
window.addEventListener(MESSAGE,this._messageController),
// Subscribe to internal message classes
PostalHelper.internalSubscriptions(this),
// Resolve worker threading
this._resolveWorker()}/**
   * Get root URL for subscriptions
   * (postMessage treats ALL urls the same off the same root)
   * @param url
   * @return {*}
   * @private
   */
_getSubscriber(e){let s=e.split("://"),t=s[0];if(void 0!==s[1]){let e=s[1].split("/")[0];return t.concat("://").concat(e)}return e}/**
   * Resolve what type of worker threading is available
   * todo: this is very incomplete
   * at the moment it only sets up the sharedworker - which is the priority in all cases anyways
   * @private
   */
_resolveWorker(){
// Browser supports SharedWorker
let e=!!window.SharedWorker;
// Polyfill on failure
return e=Boolean(e),e?(_worker=this._startSharedWorker())||(_worker=this._startDedicatedWorker()):_worker=this._startDedicatedWorker(),_worker}/**
   * Attempt to start SharedWorker thread or fail and return false
   * @return {SharedWorker | boolean}
   * @private
   */
_startSharedWorker(){let e,s=this._getPostalRoute();try{e=new SharedWorker(s.concat("PostalSharedWorker").concat(".").concat(JS),{name:POSTAL_WORKER});/* !!! DEPRECATED messaging route !!! but leaving in place as fallback for older browsers */
// this stuff is no longer tested and does not work
// (no more messaging, only the connection is being established here)
// but leaving it in to polyfill older browsers potentially
let t=_stringify({postal:!0,type:RESPONSE,id:this.id,status:!0});Deprecated.registerWorker(e,t,_events,this),/* !!! PRIMARY messaging - This should always be used first */
_channel.onmessage=(e=>{
// Handle messages sent from worker by type
const s=JSON.parse(e.data);if(!0!==s.postal)return;// Not a postalWorker message
switch(s.type){case WORKERREGISTER:if(
// worker startup
this.workerOnline=!0,this._mapToBroadcastNetwork(this.id),_queue.length){const e=()=>_queue.length;for(;e();)_queue.shift()()}break;case FIRE:s.data.msgClass&&_events.get(s.data.msgClass)&&_events.get(s.data.msgClass)(s.data.message);break;case ERROR:console.error(s.data)}})}catch(e){
// todo: Add intelligent error handling, including destination options
window.console.warn("PostalWorker - Unable to start SharedWorker"),window.console.debug(e)}return e||!1}/**
   * Start a basic web worker (not available at this time)
   * @private
   */
_startDedicatedWorker(){window.console.info("_startDedicatedWorker... (not complete)")}/**
   * Resolve route to use to find the sharedworker file
   * Priority is:
   * 1. Configuration passed to library
   * 2. Find any script tag in document which is called PostalWorker and then see if PostalRoute is defined in the querystring
   * 3. Assume the file is adjacent to where this script is being run from
   * @return {String}
   * @private
   */
_getPostalRoute(){let e=Array.from(document.querySelectorAll(SCRIPT)).filter(e=>e.src?e.src.match(POSTAL_WORKER):[]).filter(e=>null!==e);if(
// What about if more than one postalworker is found?
// This should be pointed out...
e.length>1&&window.console.warn('PostalWorker - Discovered more than 1 script tag matching "PostalWorker"'),_config.PostalRoute)return _config.PostalRoute;if(e[0]&&e[0].src&&e[0].src.match("PostalRoute")){let s=e[0].src.match(/PostalRoute=.*&/)?e[0].src.match(/PostalRoute=.*&/)[0].replace("&",""):e[0].src.match(/PostalRoute=.*$/)[0];return s.match("PostalRoute=.*$")[0].replace("PostalRoute=","")}
// Otherwise, look next to where the PostalWorker script is located
return 1===e.length?e[0].src.replace(/PostalWorker\.min\.js.*$/,"").replace(/PostalWorker\.js.*$/,""):""}/**
   * Process window messaging events "data" by "type"
   * @param e { data: JSON{ id: number, msgClass: string, message: any }, id: number, origin: string, source: port }
   * @private
   */
_messageController(e){if(!(!e.data||e.data.match&&e.data.match("webpack")||e.data.type&&e.data.type.match("webpack")||e.data.source&&e.data.source.match("react"))){let s=JSON.parse(e.data);if(s.postal&&!0===s.postal)// Not a postalWorker message
// console.info(msg);
switch(s.type){case CROSSFIRE:
// Is this a parent we don't yet know about?
_windows.has(s.id)||_windows.set(s.id,{win:e.source,subscriber:e.origin}),
// Is this window known by the module? If not, add it to the registry
_windows.has(s.id)||(_windows.set(s.id,{win:e.source,subscriber:e.origin}),_subscriptions.add(e.origin)),
// Is this a cross event?
_crossEvents.has(s.data.msgClass)&&
// If so, invoke registered callback against message
_crossEvents.get(s.data.msgClass)(s.data.message);break;case BACKFIRE:
// Children register themselves with the parent
s.data.msgClass===CHILDREGISTER?_windows.has(s.data.id)?(
// When a duplicate attempts to register, delete the previous resource
// This accounts for iframe reloading
_windows.delete(s.id),// _windows.delete(e.source);
_windows.set(s.id,{win:e.origin,subscriber:e.origin})):(
// if (!_windows.has(e.source)) {
_windows.set(s.id,{win:e.source,subscriber:e.origin}),//_windows.set(e.source, e.origin);
_subscriptions.add(e.origin)):_crossEvents.has(s.data.msgClass)&&
// Invoke registered callback
_crossEvents.get(s.data.msgClass)(s.data.message);break;case ERROR:window.console.error(s.data.message);break;default:window.console.error("PostalWorker - Unexpected message event"),window.console.debug({type:"_messageController",event:e})}}}/**
   * Register for events
   * @param msgClass
   * @param action
   * @return {PostalWorker}
   */
_on(e,s){if(e&&s){
// Send message to worker thread
let t=_stringify({postal:!0,type:ON,id:this.id,data:{msgClass:e,action:s}});
// Update registry
return _worker?_channel.postMessage(t):_queue.push(()=>_channel.postMessage(t)),_events.set(e,s),this}}/**
   * Unregister event
   * @param msgClass
   * @return {Boolean}
   */
_un(e){try{
// Send message to worker thread
let s=_stringify({postal:!0,type:UN,id:this.id,data:e});_worker?_channel.postMessage(s):_queue.push(()=>_channel.postMessage(s)),
// Update registry
_events.delete(e)}catch(e){return window.console.error(e),!1}return!0}/**
   * Fire event
   * @param msgClass
   * @param msg
   * @param audience - not being used currently
   * @return {PostalWorker}
   */
_fire(e,s,t){let n=_stringify({postal:!0,type:FIRE,id:this.id,data:{msgClass:e,message:s,audience:t}});return this.workerOnline&&_worker?_channel.postMessage(n):_queue.push(()=>_channel.postMessage(n)),!0}/**
   * Register for cross launched windows or iframes messages
   * @param msgClass {string}
   * @param action {function}
   * @param subscriber {string}
   * @param name {string}
   * @param windowparams {WindowParameters}
   * @return {PostalWorker}
   */
_crossOn(e,s,t,n,o){let r,i,a="",c="";if(t){
// It also cannot be the parent window as that is already taken
if(
// postMessage only needs the root protocol+domain to send messages
r=this._getSubscriber(t),_parentWindow&&r!==_parentWindow)return window.console.warn("PostalWorker - Unable to crossOn parentWindow"),this;if(
// Register subscription
!1===_subscriptions.has(r)&&
// If subscriber doesn't exist
_subscriptions.add(r),
// Open window for subscription
i=n||_BLANK,o){for(const e of Object.entries(o))c=c.concat(`${a} ${e[0]}=${e[1]}`),""===a&&(a=",");
// Open window (with extra params)
// debug: console.info(`window.open(${subscriber}, ${winName}, ${params})`);
// _windows.set(window.open(subscriber, winName, params), rootSubscriber);
_openingWindows.set(r,window.open(t,i,c))}else
// Open window (basic)
// _windows.set(window.open(subscriber, winName), rootSubscriber);
_openingWindows.set(r,window.open(t,i));
// Register associated action in registry
_crossEvents.set(e,s)}else
// No subscriber means to ONLY listen but not to open the window reference
_crossEvents.set(e,s);return this}/**
   * Unregister cross launch/iframes
   * @param msgClass
   * @param subscriber
   * @return {PostalWorker}
   */
_unCross(e,s){// todo: this should check if any other subscribers are using it...
if(
// Remove from cross events registry
_crossEvents.delete(e),s){
// Get root subscriber
let e=this._getSubscriber(s);
// Remove from subscriptions
_subscriptions.delete(e);
// If a reference to a window exists
let t=[];for(let[e,n]of _windows)n.subscriber===this._getSubscriber(s)&&(n.win.close(),t.push(e));t.forEach(e=>{_windows.delete(e)})}return this}/**
   * Broadcast/fire across the windows/frames
   * @param msgClass
   * @param msg
   * @return {PostalWorker}
   */
_crossFire(e,s){let t=_stringify({postal:!0,type:CROSSFIRE,id:this.id,data:{msgClass:e,message:s}});if(0===_windows.size&&window.opener&&window.opener.postMessage(t,"*"),
// Parent window is part of the crossFire group
_parentWindow&&window.top.postMessage(t,_parentWindow),_windows.size>0)for(let[,e]of _windows)e.win.postMessage(t,e.subscriber);return this}/**
   * Fire to all the things!
   * @param msgClass
   * @param msg
   * @return {PostalWorker}
   */
_fireAll(e,s){return this._fire(e,s),this._crossFire(e,s),this}/**
   * Special fire type that is specifically from child to parent window
   * @param msgClass
   * @param msg
   * @return {PostalWorker}
   */
_backFire(e,s){if(_parentWindow&&e){let t=_stringify({postal:!0,type:BACKFIRE,id:this.id,data:{msgClass:e,message:s}});try{window.top.postMessage(t,_parentWindow)}catch(e){window.console.warn("PostalWorker - Unable to backFire"),window.console.debug({msg:t,parentWindow:_parentWindow,error:e})}}return this}/**
   * Load JavaScript library into worker thread
   * todo: @Russ - support for multiple threads...
   * @param library
   */
_load(e){const s=_stringify({postal:!0,type:LOAD,id:this.id,data:e});this.workerOnline?_worker?
// Otherwise, send the message to load the library
_channel.postMessage(s):_queue.push(()=>_channel.postMessage(s)):
// If the worker has not completed startup yet, queue the message
_queue.push(()=>{_channel.postMessage(s)})}/**
   *
   * @returns
   */
_getOpeningWindows(){return _openingWindows}/**
   * Get current window references registered with postal system
   * @return {Map<any, any>}
   */
_getWindows(){return _windows}/**
   *
   * @return {Map<any, any>}
   */
_getCrossEvents(){return _crossEvents}/**
   *
   * @return {Set<any>}
   */
_getSubscriptions(){return _subscriptions}/**
   * @param subscriber
   * @return {boolean | Array}
   */
_getWindowsBySubscriber(e){let s=[];for(let[,t]of _windows)e===t.subscriber&&s.push(t);return s}/**
   *
   * @return {Map<any, any>}
   */
_getEvents(){return _events}/**
   * Generate unique number using timestamp + incrementing number
   * @returns number
   */
_uniqueNumber(){let e=Date.now();return e<=this._uniqueNumber.previous?e=++this._uniqueNumber.previous:this._uniqueNumber.previous=e,e}/**
   * Map window being opened to the window instance which is confirmed by first message
   * @param {number} id
   * @param {*} win
   * @param {string} subscriber
   */
_mapToWindow(e,s,t){_windows.set(e,{win:s,subscriber:t}),_channel.postMessage(_stringify({postal:!0,type:REGISTERID,id:e,nodeType:CROSSNODE}))}/**
   *
   * @param {number} id
   */
_unmapFromWindow(e){_windows.delete(e),_channel.postMessage(_stringify({postal:!0,type:UNREGISTERID,id:e}))}/**
   *
   * @param {number} id
   */
_mapToBroadcastNetwork(e){_broadcastNetwork.add(e),_channel.postMessage(_stringify({postal:!0,type:REGISTERID,id:e,nodeType:BROADCASTNODE}))}/**
   *
   * @param {number} id
   */
_unmapFromBroadcastNetwork(e){_broadcastNetwork.delete(e),_channel.postMessage(_stringify({postal:!0,type:UNREGISTERID,id:e}))}/**
   *
   * @param {*} address
   * @param {Function} handler - { update, box }
   */
_postBox(e,s){const t=_stringify({postal:!0,type:POBOX,id:this.id,address:e});this.workerOnline?_worker&&_channel.postMessage(t):_queue.push(()=>_channel.postMessage(t)),_POboxes.size||PostalHelper.registerCollection(this),_POboxes.get(e)||_POboxes.set(e,s)}/**
   *
   * @param {*} address
   */
_closeBox(e){const s=_POboxes.get(e);PostalHelper.registerClosure(this,e,s),_POboxes.delete(e),_channel.postMessage(_stringify({postal:!0,type:CLOSEBOX,id:this.id,address:e}))}
// _getPostBoxes() {
//   return _POboxes;
// }
/**
   *
   * @param {*} address
   * @param {*} value
   */
_post(e,s){const t=_stringify({postal:!0,type:POST,id:this.id,address:e,value:s});this.workerOnline&&_worker?_channel.postMessage(t):_queue.push(()=>_channel.postMessage(t))}/**
   *
   * @param {*} drop
   */
_collectBox(e){const{address:address,value:value,box:box}=e;let s=_POboxes.get(address);s&&s({address:address,value:value,box:box})}/**
   *
   * @param {*} address
   * @param {*} collect
   */
_lastCollection(e,s){_closures.set(e,s)}/**
   *
   * @param {*} msg
   */
_clearBox(e){const{id:id,address:address,box:box}=e;if(id===this.id){if(_closures.get(address)){_closures.get(address)({address:address,value:null,box:box}),_closures.delete(address)}_POboxes.delete(address),_closures.size||_POboxes.size||PostalHelper.unregisterCollection(this)}}/**
   *
   * @param {*} address
   * @param {*} content
   * @param {*} handling
   */
_package(e,s){const t=_stringify({postal:!0,type:PACKAGE,id:this.id,address:e});this.workerOnline?_worker&&_channel.postMessage(t):_queue.push(()=>_channel.postMessage(t)),_packages.size||PostalHelper.registerDelivery(this),_packages.get(e)||_packages.set(e,s)}/**
   *
   * @param {*} address
   * @param {*} content
   */
_pack(e,s){let t=new XMLHttpRequest,n=this;t.onload=function(){let s=new FileReader;s.onloadend=function(){const t=_stringify({postal:!0,type:PACK,id:n.id,address:e,content:s.result});n.workerOnline?_worker&&_channel.postMessage(t):_queue.push(()=>{_channel.postMessage(t)})},s.readAsDataURL(t.response)},t.open("GET",s),t.responseType="blob",t.send()}/**
   *
   * @param {*} msg
   */
_delivery(e){const{address:address,content:content}=e;let s=_packages.get(address);s&&s({address:address,content:content})}}var hasProp=Object.prototype.hasOwnProperty,index=function(e,s,t){return JSON.stringify(ensureProperties(e),s,t)},ensureProperties_1=ensureProperties;index.ensureProperties=ensureProperties_1;/**
 * PostalWorker Main Source (ES6 Version - Exports )
 * Build ES6 module version
 * @Author: Russ Stratfull - 2018
 */
let _PostalWorker;export default main;
