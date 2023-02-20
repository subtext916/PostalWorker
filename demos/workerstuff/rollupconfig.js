// Rollup plugins
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";

export default {
  input: "./demos/workerstuff/demo.js",
  name: "worker stuff",
  output: {
    file: "dist/demo.workerstuff.js",
    format: "es",
    sourcemap: false,
    onwarn: message => {
      if (/Use of eval/.test(message)) return;
      console.error(message);
    }
  },
  plugins: [
    resolve({
      jsnext: true,
      main: true,
      browser: true
    }),
    commonjs()
  ]
};
