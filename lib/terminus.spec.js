'use strict'
const http = require('http')
const { execFile, spawnSync } = require('child_process')

const expect = require('chai').expect
const fetch = require('node-fetch')

const terminus = require('./terminus')

describe('Terminus', () => {
  let server

  beforeEach(() => {
    server = http.createServer((req, res) => res.end('hello'))
  })

  afterEach(() => {
    server.close()
  })

  describe('supports onHealthcheck for the healthcheck route', () => {
    it('but keeps all the other endpoints', (done) => {
      terminus(server, {})
      server.listen(8000)

      fetch('http://localhost:8000')
        .then(res => res.text())
        .then(responseText => {
          expect(responseText).to.eql('hello')
          done()
        })
        .catch(done)
    })

    it('returns 200 on resolve', (done) => {
      let onHealthCheckRan = false

      terminus(server, {
        healthChecks: {
          '/health': () => {
            onHealthCheckRan = true
            return Promise.resolve()
          }
        }
      })
      server.listen(8000)

      fetch('http://localhost:8000/health')
        .then(res => {
          expect(res.status).to.eql(200)
          expect(onHealthCheckRan).to.eql(true)
          done()
        })
        .catch(done)
    })

    it('includes info on resolve', (done) => {
      let onHealthCheckRan = false

      terminus(server, {
        healthChecks: {
          '/health': () => {
            onHealthCheckRan = true
            return Promise.resolve({
              version: '1.0.0'
            })
          }
        }
      })
      server.listen(8000)

      fetch('http://localhost:8000/health')
        .then(res => {
          expect(res.status).to.eql(200)
          expect(onHealthCheckRan).to.eql(true)
          return res.json()
        })
        .then(json => {
          expect(json).to.deep.eql({
            status: 'ok',
            info: {
              version: '1.0.0'
            }
          })
          done()
        })
        .catch(done)
    })

    it('returns 503 on reject', (done) => {
      let onHealthCheckRan = false
      let loggerRan = false

      terminus(server, {
        healthChecks: {
          '/health': () => {
            onHealthCheckRan = true
            return Promise.reject(new Error('failed'))
          }
        },
        logger: () => {
          loggerRan = true
        }
      })
      server.listen(8000)

      fetch('http://localhost:8000/health')
        .then(res => {
          expect(res.status).to.eql(503)
          expect(onHealthCheckRan).to.eql(true)
          expect(loggerRan).to.eql(true)
          done()
        })
        .catch(done)
    })

    it('returns 503 once signal received', (done) => {
      execFile('node', ['lib/standalone-tests/terminus.onsignal.fail.js'])

      // let the process start up
      setTimeout(() => {
        fetch('http://localhost:8000/health')
          .then(res => {
            expect(res.status).to.eql(503)
            done()
          })
          .catch(done)
      }, 300)
    })
  })

  it('runs onSignal when getting the SIGTERM signal', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onsigterm.js'])
    expect(result.stdout.toString().trim()).to.eql('on-sigterm-runs')
  })

  it('runs onShutdown after SIGTERM onSignal', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onshutdown.sigterm.js'])
    expect(result.stdout.toString().trim()).to.eql('on-sigterm-runs\non-shutdown-runs')
  })

  it('runs onSignal when getting SIGINT signal', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onsigint.js'])
    expect(result.stdout.toString().trim()).to.eql('on-sigint-runs')
  })

  it('runs onShutdown after SIGINT onSignal', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onshutdown.sigint.js'])
    expect(result.stdout.toString().trim()).to.eql('on-sigint-runs\non-shutdown-runs')
  })

  it('runs onSignal when getting SIGUSR2 signal', () => {
    let result = spawnSync('node', ['lib/standalone-tests/terminus.onsigusr2.js'])
    expect(result.stdout.toString().trim()).to.eql('on-sigusr2-runs')
  })

  it('runs onShutdown after SIGUSR2 onSignal', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onshutdown.sigusr2.js'])
    expect(result.stdout.toString().trim()).to.eql('on-sigusr2-runs\non-shutdown-runs')
  })

  it('runs onSignal when killed with SIGTERM and multiple signals are listened for', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onmultiple.js', 'SIGTERM'])
    expect(result.stdout.toString().trim()).to.eql('on-sigterm-runs')
  })

  it('runs onSignal when killed with SIGINT and multiple signals are listened for', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onmultiple.js', 'SIGINT'])
    expect(result.stdout.toString().trim()).to.eql('on-sigint-runs')
  })

  it('runs onSignal when killed with SIGUSR2 and multiple signals are listened for', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onmultiple.js', 'SIGUSR2'])
    expect(result.stdout.toString().trim()).to.eql('on-sigusr2-runs')
  })

  it('runs onShutdown after onSignal when killed with SIGTERM and multiple signals are listened for', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onshutdown.multiple.js', 'SIGTERM'])
    expect(result.stdout.toString().trim()).to.eql('on-sigterm-runs\non-shutdown-runs')
  })

  it('runs onShutdown after onSignal when killed with SIGINT and multiple signals are listened for', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onshutdown.multiple.js', 'SIGINT'])
    expect(result.stdout.toString().trim()).to.eql('on-sigint-runs\non-shutdown-runs')
  })

  it('runs onShutdown after onSignal when killed with SIGUSR2 and multiple signals are listened for', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.onshutdown.multiple.js', 'SIGUSR2'])
    expect(result.stdout.toString().trim()).to.eql('on-sigusr2-runs\non-shutdown-runs')
  })

  it('manages multiple servers', () => {
    const result = spawnSync('node', ['lib/standalone-tests/terminus.multiserver.js'])
    expect(result.stdout.toString().trim()).to.eql([
      'server1:onSignal',
      'server2:onSignal',
      'server3:onSignal'
    ].join('\n'))
  })
})
