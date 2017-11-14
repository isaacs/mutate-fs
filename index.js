'use strict'
// evil-fs: a module to make node's fs util a bit of a jerk.
// XXX this should be its own npm package
//
// All of these functions return the de-mutating restore function

const fs = require('fs')

// zenoRead()
// Make fs.read() calls return half as much data, zeno's paradox style
const zenoRead = exports.zenoRead = _ => {
  return mutateArgs('read', (args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null
    const fd = args.shift()
    const buffer = args.shift()
    const offset = args.shift()
    const length = args.shift()
    const position = args.shift()
    const zlen = length > 1 ? Math.floor(length / 2) : length
    return [fd, buffer, offset, zlen, position, cb]
  })
}

const constants = require('constants')
// should always be set, but standard values are here just in case.
/* istanbul ignore next */
const S_IFMT   = constants.S_IFMT   || 0o170000
/* istanbul ignore next */
const S_IFREG  = constants.S_IFREG  || 0o100000
/* istanbul ignore next */
const S_IFDIR  = constants.S_IFDIR  || 0o040000
/* istanbul ignore next */
const S_IFCHR  = constants.S_IFCHR  || 0o020000
/* istanbul ignore next */
const S_IFBLK  = constants.S_IFBLK  || 0o060000
/* istanbul ignore next */
const S_IFIFO  = constants.S_IFIFO  || 0o010000
/* istanbul ignore next */
const S_IFLNK  = constants.S_IFLNK  || 0o120000
/* istanbul ignore next */
const S_IFSOCK = constants.S_IFSOCK || 0o140000

// statType(type)
// mutate stat/fstat/lstat calls to always return the specified type
// only mutates if there is no error returned by the stat call.
// Takes a type to match the `isBlank()` stat methods
// File, Directory, CharacterDevice, BlockDevice, FIFO, SymbolicLink, Socket
const statType = exports.statType = type => {
  const mode = type === 'File' ? S_IFREG
             : type === 'Directory' ? S_IFDIR
             : type === 'CharacterDevice' ? S_IFCHR
             : type === 'BlockDevice' ? S_IFBLK
             : type === 'FIFO' ? S_IFIFO
             : type === 'SymbolicLink' ? S_IFLNK
             : type === 'Socket' ? S_IFSOCK
             : null
  if (!mode)
    throw new TypeError('invalid type: ' + type)
  return statMutate((error, stat) => {
    if (stat)
      stat.mode = stat.mode & (S_IFMT ^ 0o777777) | mode
  })
}

const statFail = exports.statFail = error => {
  const unfail = fail('stat', error)
  const unfaill = fail('lstat', error)
  const unfailf = fail('fstat', error)
  return _ => unfail(unfaill(unfailf()))
}

// pass(methodName, data)
// Cause fs[methodName] and fs[methodName + 'Sync'] to
// automatically pass with the data provided.
// Returns restore method
const pass = exports.pass = (method, data) => {
  const orig = fs[method]
  const origSync = fs[method + 'Sync']

  fs[method] = function () {
    const cb = arguments[arguments.length - 1]
    setTimeout(_ => cb(null, data))
  }

  fs[method + 'Sync'] = _ => {
    return data
  }

  return _ => {
    fs[method] = orig
    fs[method + 'Sync'] = origSync
  }
}

// fail(methodName, error)
// Cause specified fs method to fail with the provided error
const fail = exports.fail = (method, error) => {
  const orig = fs[method]
  const origSync = fs[method + 'Sync']

  fs[method] = function () {
    const cb = arguments[arguments.length - 1]
    const callstack = new Error('trace').stack
    setTimeout(_ => {
      Object.defineProperty(error, 'callstack', {
        get: _ => callstack,
        configurable: true
      })
      cb(error)
    })
  }

  fs[method + 'Sync'] = _ => {
    const callstack = new Error('trace').stack
    Object.defineProperty(error, 'callstack', {
      get: _ => callstack,
      configurable: true
    })
    throw error
  }

  return _ => {
    fs[method] = orig
    fs[method + 'Sync'] = origSync
  }
}

// statMutate(fn)
// Mutate all stat functions at once
const statMutate = exports.statMutate = fn => {
  const unmutate = mutate('stat', fn)
  const unmutatel = mutate('lstat', fn)
  const unmutatef = mutate('fstat', fn)

  return _ => unmutate(unmutatel(unmutatef()))
}

// mutateArgs(method, fn)
// Pass in the arguments to method to fn(), which returns a mutated
// set of arguments that the function will be called with
const mutateArgs = exports.mutateArgs = (method, fn) => {
  const orig = fs[method]
  const origSync = fs[method + 'Sync']

  fs[method] = function () {
    orig.apply(fs, fn(Array.from(arguments)))
  }

  fs[method + 'Sync'] = function () {
    return origSync.apply(fn, fn(Array.from(arguments)))
  }

  return _ => {
    fs[method] = orig
    fs[method + 'Sync'] = origSync
  }
}

// mutate(method, fn)
// Apply fn(error, data) to return values from fs[method]
// If the function returns an array, it should be [newError, newData]
// If the function does not return a value, use (mutated in place) values
const mutate = exports.mutate = (method, fn) => {
  const orig = fs[method]
  const origSync = fs[method + 'Sync']

  fs[method] = function () {
    const cb = arguments[arguments.length - 1]
    arguments[arguments.length - 1] = (error, data) => {
      const mutated = fn(error, data)
      if (!mutated) // just mutate objects in-place is fine
        cb(error, data)
      else
        cb(mutated[0], mutated[1])
    }
    orig.apply(fs, arguments)
  }

  fs[method + 'Sync'] = function () {
    let result, error
    try {
      result = origSync.apply(fs, arguments)
    } catch (er) {
      error = er
    }
    const mutated = fn(error, result)
    if (mutated) {
      error = mutated[0]
      result = mutated[1]
    }
    if (error)
      throw error
    return result
  }

  return _ => {
    fs[method] = orig
    fs[method + 'Sync'] = origSync
  }
}

const delay = exports.delay = (method, ms) => {
  const orig = fs[method]
  const origSync = fs[method + 'Sync']
  fs[method] = function () {
    const cb = arguments[arguments.length - 1]
    const end = Date.now() + ms
    arguments[arguments.length - 1] = (error, data) =>
      setTimeout(_ => cb(error, data), end - Date.now())
    orig.apply(fs, arguments)
  }

  fs[method + 'Sync'] = function () {
    const end = Date.now() + ms
    try {
      return origSync.apply(this, arguments)
    } finally {
      while (end > Date.now()) {
        fs.readFileSync(__filename)
      }
    }
  }

  return _ => {
    fs[method] = orig
    fs[method + 'Sync'] = origSync
  }
}
