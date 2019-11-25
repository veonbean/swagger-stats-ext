const uuid = require('uuidv4').uuid
const pm2Cb = require('pm2')
const pm2 = Promise.promisifyAll(pm2Cb)

/** Total timeout for workers, ms */
const TIMEOUT = 2000
let promClient, swStats
/** The global message topic for gathering Prometheus metrics */
const TOPIC = 'get_prom_register'
/** Singleton instance of PM2 message bus */
let pm2Bus
const instanceId = Number(process.env.pm_id)

function init(_swStats) {
  swStats = _swStats
  promClient = swStats.promClient

  /** Every process listens on the IPC channel for the metric request TOPIC, 
  responding with Prometheus metrics when needed. */
  process.on('message', packet => {
    try {
      if (packet.topic === TOPIC) {
        process.send({
          type: `process:${packet.data.targetInstanceId}`,
          data: {
            instanceId,
            register: promClient.register.getMetricsAsJSON(),
            success: true,
            reqId: packet.data.reqId
          }
        })
      }
    } catch (e) {
      console.error('Error sending metrics to master node', e)
    }
  })
}

async function requestNeighboursData(instancesData, reqId) {
  const requestData = {
    topic: TOPIC,
    data: {
      targetInstanceId: instanceId,
      reqId
    }
  }

  let promises = []
  for (let instanceData of Object.values(instancesData)) {
    let targetId = instanceData.pm_id
    // don't send message to self
    if (targetId !== instanceId) {
      promises.push(
        pm2
          .sendDataToProcessIdAsync(targetId, requestData)
          .catch(e => console.error(e))
      )
    }
  }

  // Resolves when all responses have been received
  return Promise.all(promises)
}

/** Master process gathering aggregated metrics data */
async function getAggregatedRegistry(instancesData) {
  if (!instancesData || !instancesData.length) {
    return
  }

  // assigning a unique request ID
  const reqId = uuid()

  const registryPromise = new Promise((resolve, reject) => {
    const instancesCount = instancesData.length
    const registersPerInstance = []
    const busEventName = `process:${instanceId}`
    // master process metrics
    registersPerInstance[instanceId] = promClient.register.getMetricsAsJSON()
    let registersReady = 1

    const finish = () => {
      // deregister event listener to prevent memory leak
      pm2Bus.off(busEventName)
      resolve(promClient.AggregatorRegistry.aggregate(registersPerInstance))
    }

    // we can only resolve/reject this promise once
    // this safety timeout deregisters the listener in case of an issue
    const timeout = setTimeout(finish, TIMEOUT)

    /** Listens to slave instances' responses */
    pm2Bus.on(busEventName, packet => {
      try {
        if (packet.data.reqId === reqId) {
          // array fills up in order of responses
          registersPerInstance[packet.data.instanceId] = packet.data.register
          registersReady++

          if (registersReady === instancesCount) {
            // resolve when all responses have been received
            clearTimeout(timeout)
            finish()
          }
        }
      } catch (e) {
        reject(e)
      }
    })
  })

  // request instance data after the response listener has been set up
  // we are not awaiting, resolution is handled by the bus event listener
  requestNeighboursData(instancesData, reqId)

  return registryPromise
}

async function getPm2Metrics(_swStats) {
  init(_swStats)

  // create or use bus singleton
  pm2Bus = pm2Bus || (await pm2.launchBusAsync())
  // get current instances (threads) data
  const instancesData = await pm2.listAsync()
  if (instancesData.length > 1) {
    // multiple threads - aggregate
    const register = await getAggregatedRegistry(instancesData)
    return register.metrics()
  } else {
    // 1 thread - send local stats
    return swStats.getPromStats()
  }
}

module.exports = {
  getPm2Metrics
}