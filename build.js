var child_process = require('child_process');
var fs = require('fs');

eval(fs.readFileSync('./docs/common.js', 'utf8'));

// Always build all targets to catch errors in other targets
function compile(compiler, sources) {
  var compiled = compileJavaScript(compiler/* , [ 'WASM_TRACE' ] */);

  var compiledC = compiled(sources, 'C', 'compiled');
  if (compiledC.stdout) process.stdout.write(compiledC.stdout);
  if (!compiledC.success) process.exit(1);

  var compiledJS = compiled(sources, 'JavaScript', 'compiled');
  if (compiledJS.stdout) process.stdout.write(compiledJS.stdout);
  if (!compiledJS.success) process.exit(1);

  var compiledWASM = compiled(sources, 'WebAssembly', 'compiled');
  if (compiledWASM.stdout) process.stdout.write(compiledWASM.stdout);
  if (!compiledWASM.success) process.exit(1);

  return {
    c: compiledC.output,
    h: compiledC.secondaryOutput,
    js: compiledJS.output,
    wasm: compiledWASM.output,
  };
}

function compileNativeUnix() {
  try {
    var command = [
      'cc',
      '../bin/thinc.c',
      '../out/compiled.c',
      '-o', 'thinc',
      '-Wall',
      '-Wextra',
      '-Wno-unused-parameter',
      '-Wno-unused-function',
      '-std=c99',
      '-O3',
    ];
    console.log(command.join(' '));
    var child = child_process.spawn(command.shift(), command, { stdio: 'inherit', cwd: __dirname + "/out" });
  } catch (e) {
    console.log('failed to build the native compiler');
  }
}

function compileNativeWindows() {
  // Find all installed Visual Studio versions
  var versions = [];
  Object.keys(process.env).forEach(function(key) {
    var match = /^VS(\d+)COMNTOOLS$/.exec(key);
    if (match) {
      versions.push(match[1] | 0);
    }
  });

  // Try the compilers in descending order
  versions.sort(function(a, b) {
    return b - a;
  });
  next();

  function next() {
    if (!versions.length) {
      console.log('failed to build the native compiler');
      return;
    }

    var version = versions.shift();
    var folder = process.env['VS' + version + 'COMNTOOLS'];
    var child = child_process.spawn('cmd.exe', [], { cwd: __dirname + "/out", stdio: ['pipe', process.stdout, process.stderr] });
    child.stdin.write('"' + folder + '/../../VC/bin/vcvars32.bat"\n');
    child.stdin.write('cl.exe /O2 ../bin/thinc.c ../out/compiled.c /Fe"thinc.exe"\n');
    child.stdin.end();
    child.on('close', function(code) {
      if (code !== 0 || !fs.existsSync(__dirname + '/out/thinc.exe')) {
        next();
      }
    });
  }
}

var sourceDir = __dirname + '/src';
var sources = [];

(function recurse(sourceDir) {
  fs.readdirSync(sourceDir).forEach(function(entry) {
    entry = sourceDir + '/' + entry;
    var stat = fs.statSync(entry);
    if (stat.isDirectory()) {
      recurse(entry);
    } else if (/\.thin$/.test(entry)) {
      sources.push({
        name: entry,
        contents: fs.readFileSync(entry, 'utf8').replace(/\r\n/g, '\n'),
      });
    }
  });
})(sourceDir);

var compiled = fs.readFileSync(__dirname + '/docs/compiled.js', 'utf8');

console.log('compiling...');
compiled = compile(compiled, sources);

console.log('compiling again...');
compiled = compile(compiled.js, sources);

console.log('compiling once more...');
compiled = compile(compiled.js, sources);

fs.writeFileSync(__dirname + '/out/compiled.c', compiled.c);
fs.writeFileSync(__dirname + '/out/compiled.h', compiled.h);
console.log('wrote to "out/compiled.c"');
console.log('wrote to "out/compiled.h"');

fs.writeFileSync(__dirname + '/docs/compiled.js', compiled.js);
console.log('wrote to "docs/compiled.js"');
fs.writeFileSync(__dirname + '/docs/compiled.wasm', Buffer(compiled.wasm));
console.log('wrote to "docs/compiled.wasm"');

console.log('building the native compiler...');
if (process.platform === 'win32') compileNativeWindows();
else compileNativeUnix();
