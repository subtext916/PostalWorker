/** Script-tag build (dist/PostalWorker.min.js): sets window.PostalWorker (v4) and window.createPostalWorker. */
import PostalWorker from "./compat";
import { createPostalWorker } from "./core";

Object.assign(globalThis, { PostalWorker, createPostalWorker });
