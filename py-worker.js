/* Runs Python answers off the main thread, using Pyodide (CPython built for browsers).
   The code never leaves the device. Pyodide itself is downloaded once from the jsDelivr CDN
   and then kept by the service worker for offline use. If code loops forever the app
   terminates this worker and starts a fresh one. */
const BASE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

const HARNESS = `
import os, sys, io, traceback
os.environ['MPLBACKEND'] = 'Agg'

def __qd_run(src, stdin_text):
    out, errs = io.StringIO(), io.StringIO()
    old = sys.stdout, sys.stderr, sys.stdin
    sys.stdout, sys.stderr, sys.stdin = out, errs, io.StringIO(stdin_text)
    err = ''
    try:
        exec(compile(src, 'answer.py', 'exec'), {'__name__': '__main__'})
    except SystemExit:
        pass
    except BaseException:
        et, ev, tb = sys.exc_info()
        err = ''.join(traceback.format_exception(et, ev, tb.tb_next if tb is not None else None))
    finally:
        sys.stdout, sys.stderr, sys.stdin = old
    return [out.getvalue(), err]
`;

let ready = null;
function boot() {
  if (!ready) {
    ready = (async () => {
      importScripts(BASE + 'pyodide.js');
      const py = await loadPyodide({ indexURL: BASE });
      py.runPython(HARNESS);
      return py;
    })();
  }
  return ready;
}

onmessage = async e => {
  const job = e.data;
  let py;
  try {
    postMessage({ status: 'loading' });
    py = await boot();
  } catch (err) {
    ready = null;
    postMessage({ error: 'Could not load Python. The first use needs an internet connection; after that it works offline.', fatal: true });
    return;
  }
  postMessage({ status: 'packages' });
  try {
    // numpy, scipy, sympy, pandas, matplotlib and friends are fetched only when the code imports them
    await py.loadPackagesFromImports([job.code].concat(job.tests.map(t => t.code || '')).join('\n'));
  } catch (err) { /* a syntax error or missing package shows up properly when the code runs */ }
  postMessage({ status: 'running' });
  const run = py.globals.get('__qd_run');
  for (const t of job.tests) {
    let r;
    try {
      const res = run(job.code + '\n' + (t.code || ''), t.input || '');
      r = res.toJs();
      res.destroy();
    } catch (err) { r = ['', String(err)]; }
    postMessage({ result: { out: r[0], err: r[1] } });
  }
  postMessage({ done: true });
};
