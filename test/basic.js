'use strict'
const t = require('tap')
const fs = require('fs')
const mutateFS = require('../')

t.test('zenoRead', t => {
  t.tearDown(mutateFS.zenoRead())
  const fd = fs.openSync(__filename, 'r')
  const size = fs.fstatSync(fd).size
  const buf = Buffer.alloc(size)
  fs.read(fd, buf, 0, size, 0, (er, bytesRead) => {
    if (er)
      throw er
    t.notEqual(bytesRead, size)
    bytesRead = fs.readSync(fd, buf, 0, size, 0)
    t.notEqual(bytesRead, size)
    fs.closeSync(fd)

    // don't try to split 1 byte though
    fs.writeFileSync('one-byte', '1')
    const fd1 = fs.openSync('one-byte', 'r')
    fs.read(fd1, buf, 0, 1, 0, (er, bytesRead) => {
      t.equal(bytesRead, 1)
      fs.closeSync(fd1)
      fs.unlinkSync('one-byte')
      t.end()
    })
  })
})

t.test('zenoRead, defaults', t => {
  t.tearDown(mutateFS.zenoRead())
  const fd = fs.openSync(__filename, 'r')
  const size = fs.fstatSync(fd).size
  const buf = Buffer.alloc(size)
  fs.read(fd, buf, 0, size, null, (er, bytesRead) => {
    t.notEqual(bytesRead, size)
    bytesRead = fs.readSync(fd, buf, 0, size, null)
    t.notEqual(bytesRead, size)
    fs.closeSync(fd)

    // don't try to split 1 byte though
    fs.writeFileSync('one-byte', '1')
    const fd1 = fs.openSync('one-byte', 'r')
    fs.read(fd1, buf, 0, 1, null, (er, bytesRead) => {
      t.equal(bytesRead, 1)
      fs.closeSync(fd1)
      fs.unlinkSync('one-byte')
      t.end()
    })
  })
})

t.test('pass', t => {
  t.tearDown(mutateFS.pass('stat', 'hello'))
  t.equal(fs.statSync('nope'), 'hello')
  t.throws(_ => fs.lstatSync('nope'))
  fs.stat('nope', (er, data) => {
    t.equal(data, 'hello')
    t.end()
  })
})

t.test('fail', t => {
  t.tearDown(mutateFS.fail('open', new Error('not open')))
  t.throws(_ => fs.openSync(__filename, 'r'), {
    message: 'not open',
    callstack: /Error: trace/
  })
  fs.open(__filename, 'r', (er, fd) => {
    t.notOk(fd)
    t.match(er, { message: 'not open', callstack: /Error: trace/ })
    t.end()
  })
})

t.test('mutate in place', t => {
  t.plan(2)
  t.test('failure', t => {
    t.tearDown(mutateFS.mutate('readlink', (er, linkpath) => {
      t.match(er, { message: /EINVAL: invalid argument, readlink/ })
      er.testMutate = true
    }))

    t.throws(_ => fs.readlinkSync(__filename), { testMutate: true })
    fs.readlink(__filename, (er, linkpath) => {
      t.notOk(linkpath)
      t.match(er, { testMutate: true })
      t.end()
    })
  })

  t.test('success', t => {
    t.tearDown(mutateFS.mutate('stat', (er, stat) => {
      if (stat)
        stat.testMutate = true
    }))
    t.match(fs.statSync(__filename), { testMutate: true })
    fs.stat(__filename, (er, stat) => {
      if (er)
        throw er
      t.match(stat, { testMutate: true })
      t.end()
    })
  })
})

t.test('mutate return', t => {
  t.plan(4)
  t.test('failure', t => {
    t.tearDown(mutateFS.mutate('readlink', (er, linkpath) => {
      t.match(er, { message: /EINVAL: invalid argument, readlink/ })
      er.testMutate = true
      return [er, linkpath]
    }))

    t.throws(_ => fs.readlinkSync(__filename), { testMutate: true })
    fs.readlink(__filename, (er, linkpath) => {
      t.notOk(linkpath)
      t.match(er, { testMutate: true })
      t.end()
    })
  })

  t.test('success', t => {
    t.tearDown(mutateFS.mutate('stat', (er, stat) => {
      if (stat)
        stat.testMutate = true
      return [er, stat]
    }))
    t.match(fs.statSync(__filename), { testMutate: true })
    fs.stat(__filename, (er, stat) => {
      if (er)
        throw er
      t.match(stat, { testMutate: true })
      t.end()
    })
  })

  t.test('success -> failure', t => {
    t.tearDown(mutateFS.mutate('stat', (er, stat) => {
      er = new Error('asdf')
      return [er]
    }))
    t.throws(_ => fs.statSync(__filename), { message: 'asdf' })
    fs.stat(__filename, (er, stat) => {
      t.match(er, { message: 'asdf' })
      t.end()
    })
  })

  t.test('failure -> success', t => {
    t.tearDown(mutateFS.mutate('readlink', (er, linkpath) => {
      t.match(er, { message: /EINVAL: invalid argument, readlink/ })
      return [null, 'linktarget']
    }))

    t.equal(fs.readlinkSync(__filename), 'linktarget')
    fs.readlink(__filename, (er, linkpath) => {
      if (er)
        throw er
      t.equal(linkpath, 'linktarget')
      t.end()
    })
  })
})

t.test('statfail', t => {
  t.tearDown(mutateFS.statFail(new Error('oof')))

  t.throws(_ => fs.lstatSync(__filename), new Error('oof'))
  fs.fstat(fs.openSync(__filename, 'r'), er => {
    t.match(er, { message: 'oof' })
    t.end()
  })
})

t.test('stat mutate', t => {
  t.tearDown(mutateFS.statMutate(_ => [null, 'this is fine']))

  t.equal(fs.lstatSync(__filename), 'this is fine')
  fs.fstat(99999, (er, data) => {
    t.equal(data, 'this is fine')
    t.end()
  })
})

t.test('stat type', t => {
  const types = [
    'File',
    'Directory',
    'CharacterDevice',
    'BlockDevice',
    'FIFO',
    'SymbolicLink',
    'Socket'
  ]
  t.plan(types.length + 1)
  t.throws(_ => mutateFS.statType('wtf'), new Error('invalid type: wtf'))
  types.forEach(type => t.test(type, t => {
    t.tearDown(mutateFS.statType(type))
    t.throws(_ => fs.statSync('does not exist'))
    t.ok(fs.statSync(__filename)['is' + type]())
    const fd = fs.openSync(__filename, 'r')
    fs.lstat(__filename, (er, stat) => {
      t.ok(stat['is' + type]())
      fs.fstat(99999, (er, stat) => {
        t.match(er, { code: 'EBADF' })
        t.ok(fs.fstatSync(fd)['is' + type]())
        fs.closeSync(fd)
        t.end()
      })
    })
  }))
})

t.test('delay', t => {
  const ms = 100
  // mutate so that it doesn't take any time at all
  const stat = fs.statSync(__filename)
  const resetStat = mutateFS.pass('stat', stat)
  const resetDelay = mutateFS.delay('stat', 100)
  t.tearDown(_ => (resetStat(), resetDelay()))

  const before = Date.now()
  t.equal(fs.statSync('whatever'), stat)
  t.ok(Date.now() - before >= 100, 'at least 100ms passed')
  const beforeAsync = Date.now()
  fs.stat('yolo haha', (er, st) => {
    t.equal(st, stat)
    if (er)
      throw er
    t.ok(Date.now() - beforeAsync >= 100, 'at least 100ms passed')
    t.end()
  })
})
