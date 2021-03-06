'use strict'

const stoppable = require('stoppable')

const SUCCESS_RESPONSE = JSON.stringify({
  status: 'ok'
})

const FAILURE_RESPONSE = JSON.stringify({
  status: 'error'
})

function noopResolves () {
  return Promise.resolve()
}

function sendSuccess (res, info) {
  res.statusCode = 200
  if (info) {
    return res.end(JSON.stringify({
      status: 'ok',
      info: info
    }))
  }
  res.end(SUCCESS_RESPONSE)
}

function sendFailure (res) {
  res.statusCode = 503
  res.end(FAILURE_RESPONSE)
}

const intialState = {
  isShuttingDown: false
}

function noop () {}

function decorateWithHealthCheck (server, state, options) {
  const { healthChecks, logger } = options

  server.listeners('request').forEach((listener) => {
    server.removeListener('request', listener)
    server.on('request', (req, res) => {
      if (healthChecks[req.url]) {
        if (state.isShuttingDown) {
          return sendFailure(res)
        }
        healthChecks[req.url]()
          .then((info) => {
            sendSuccess(res, info)
          })
          .catch((error) => {
            logger('healthcheck failed', error)
            sendFailure(res)
          })
      } else {
        listener(req, res)
      }
    })
  })
}

function decorateWithSignalHandler (server, state, options) {
  const { signals, onSignal, beforeShutdown, onShutdown, timeout, logger } = options

  stoppable(server, timeout)

  function cleanup (signal) {
    if (!state.isShuttingDown) {
      state.isShuttingDown = true
      beforeShutdown()
        .then(() => onSignal())
        .then(() => onShutdown())
        .then(() => {
          signals.forEach(sig => process.removeListener(sig, cleanup))
          process.kill(process.pid, signal)
        })
        .catch((error) => {
          logger('error happened during shutdown', error)
          process.exit(1)
        })
    }
  }
  signals.forEach(
    sig => process.on(sig, cleanup)
  )
}

function terminus (server, options = {}) {
  const { signal = 'SIGTERM',
    signals = [],
    timeout = 1000,
    healthChecks = {},
    onShutdown = noopResolves,
    beforeShutdown = noopResolves,
    logger = noop } = options
  const onSignal = options.onSignal || options.onSigterm || noopResolves
  const state = Object.assign({}, intialState)

  if (Object.keys(healthChecks).length > 0) {
    decorateWithHealthCheck(server, state, {
      healthChecks,
      logger
    })
  }

  // push the signal into the array
  // for backwards compatability
  if (!signals.includes(signal)) signals.push(signal)
  decorateWithSignalHandler(server, state, {
    signals,
    onSignal,
    beforeShutdown,
    onShutdown,
    timeout,
    logger
  })

  return server
}

module.exports = terminus
