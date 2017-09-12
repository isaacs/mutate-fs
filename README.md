# mutate-fs

Mutate the filesystem behavior for tests.

![X-Men](xmen.gif "mutants")

This is not a full-fledged filesystem mock library as much as it is a
way to just modify the data that's returned, especially to trigger
cases where the fs is a bit of a jerk, and you want to make sure your
code handles it properly.

All of the methods return a function that restores the default
behavior.

You should probably not use this module outside of a test environment.
By design, it does bad things that will probably break stuff.

## USAGE

```js
const mutateFS = require('mutate-fs')

// you can of course us this with any test harness,
// including "plain old assert", but showing TAP because I like it.

const t = require('tap')

t.test('test what happens when stat fails', t => {
  // restore normalcy after this test
  t.tearDown(mutateFS.statFail(new Error('pwn')))

  // verify that statting this file (which exists) throws our error
  t.throws(_ => {
    fs.statSync(__filename)
  }, new Error('pwn'))

  t.end()
})

// plain-old-assert example
// make stat lie
const restore = mutateFS.statType('Directory')
const assert = require('assert')
assert(fs.statSync(__filename).isDirectory())
restore()
assert(fs.statSync(__filename).isFile())
```

## METHODS

### fail(method, error)

Whenever `fs[method]` is called, call the callback with the supplied
error.  Whenever `fs[methodSync]` is called, throw the supplied error.

Note that this means that the actual underlying fs method is not called.

Error is decorated with a `callstack` string, which is the stack where
the fail method was actually called from.

### pass(method, data)

The oppose of `fail`.  Whenever `fs[method]` is called, call the
callback with the supplied data and no error.  Whenever
`fs[methodSync]` is called, return the supplied data.

Note that this means that the actual underlying fs method is not called.

### mutate(method, fn)

Whenever `fs[method]` or `fs[methodSync]` is called, apply the
`fn(error, data)` to the results.

`fn` can either mutate the data in-place (and return nothing) or can
return a `[error, data]` array which is treated as the new result.

### mutateArgs(method, fn)

Mutate the arguments passed _into_ the fs method specified.

`fn` takes an array of arguments, and should return the munged set of
arguments to call the method with.

### zenoRead()

Make all `read()` calls appear to return half as many bytes.  This
exercises frequently overlooked edge cases in many programs that call
`fs.read()` directly.

As of version 2, this works by modifying the `length` argument passed
to `fs.read` and `fs.readSync'.  In version 1.x of this library, it
only modified the _reported_ number of bytes read, limiting its
utility for testing shortened non-positioned (file-scanning) reads.

The name is a reference to [Zeno's Paradox of Achilles and the
Tortoise](https://en.wikipedia.org/wiki/Zeno%27s_paradoxes#Achilles_and_the_tortoise).

### delay(method, ms)

Delay calls to fs[method] by the specified number of milliseconds.

Delays sync calls by doing a bunch of unnecessary file reads in a
busy-loop.

### statFail(error)

Like `fail()`, but called on all three of fstat, lstat, and stat.

### statMutate(fn)

Like `mutate()`, but called on all three of fstat, lstat, and stat.

### statType(type)

Mutate stat, lstat, and fstat return values to make them appear to be
the provided type.  That is, `stat.is<Type>` will return true.

Type must be one of: `'File'`, `'Directory'`, `'CharacterDevice'`,
`'BlockDevice'`, `'FIFO'`, `'SymbolicLink'`, or `'Socket'`.
