var _ = require('underscore');
var rpio = require('rpio');
var Service, Characteristic, HomebridgeAPI;

const STATE_UNSECURED = 0;
const STATE_SECURED = 1;
const STATE_JAMMED = 2;
const STATE_UNKNOWN = 3;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  HomebridgeAPI = homebridge;

  homebridge.registerAccessory('homebridge-gpio-electromagnetic-lock', 'ElectromagneticLock', ElectromagneticLockAccessory);
}

function ElectromagneticLockAccessory(log, config) {
  _.defaults(config, {activeLow: true, reedSwitchActiveLow: true});

  this.log = log;
  this.name = config['name'];
  this.lockPin = config['lockPin'];
  this.doorPin = config['doorPin'];
  this.initialState = config['activeLow'] ? rpio.HIGH : rpio.LOW;
  this.activeState = config['activeLow'] ? rpio.LOW : rpio.HIGH;
  this.reedSwitchActiveState = config['reedSwitchActiveLow'] ? rpio.LOW : rpio.HIGH;
  this.pollTransition = config['reedSwitchActiveLow'] ? rpio.POLL_LOW : rpio.POLL_HIGH;
  this.doorWasOpenedAfterUnlocking = false;

  this.cacheDirectory = HomebridgeAPI.user.persistPath();
  this.storage = require('node-persist');
  this.storage.initSync({dir:this.cacheDirectory, forgiveParseErrors: true});

  var cachedCurrentState = this.storage.getItemSync(this.name);
  if((cachedCurrentState === undefined) || (cachedCurrentState === false)) {
    this.currentState = STATE_UNKNOWN;
  } else {
    this.currentState = cachedCurrentState;
  }

  this.targetState = this.currentState;

  this.service = new Service.LockMechanism(this.name);

  this.infoService = new Service.AccessoryInformation();
  this.infoService
    .setCharacteristic(Characteristic.Manufacturer, 'Radoslaw Sporny')
    .setCharacteristic(Characteristic.Model, 'RaspberryPi GPIO Electromagnetic Lock')
    .setCharacteristic(Characteristic.SerialNumber, 'Version 1.0.3');

  // use gpio pin numbering
  rpio.init({mapping: 'gpio'});
  rpio.open(this.lockPin, rpio.OUTPUT, this.initialState);
  if (this.doorPin) {
    rpio.open(this.doorPin, rpio.INPUT);
    if (this.currentState == STATE_UNSECURED) {
      this.log('Lock is unsecured, waiting for door cycle.');
      this.doorWasOpenedAfterUnlocking = true;
      try {
        rpio.poll(this.doorPin, this.secureLock.bind(this), this.pollTransition);
      } catch (error) {
        this.log('Door is already polling for events.')
      }
    }
  }

  this.service
    .getCharacteristic(Characteristic.LockCurrentState)
    .on('get', this.getCurrentState.bind(this));

  this.service
    .getCharacteristic(Characteristic.LockTargetState)
    .on('get', this.getTargetState.bind(this))
    .on('set', this.setTargetState.bind(this));
}

ElectromagneticLockAccessory.prototype.getCurrentState = function(callback) {
  if (this.isDoorOpen()) {
    this.targetState = STATE_UNSECURED;
    this.currentState = STATE_UNSECURED;
    this.doorWasOpenedAfterUnlocking = true;
    try {
      rpio.poll(this.doorPin, this.secureLock.bind(this), this.pollTransition);
    } catch (error) {
      this.log('Door is already polling for events.')
    }
  }
  this.log("Lock current state: %s", this.currentState);
  callback(null, this.currentState);
}

ElectromagneticLockAccessory.prototype.getTargetState = function(callback) {
  this.log("Lock target state: %s", this.targetState);
  callback(null, this.targetState);
}

ElectromagneticLockAccessory.prototype.setTargetState = function(state, callback) {
  if (state) { // can't lock electromagnetic with memory
    callback(null, this.currentState);
    return false;
  }

  this.log('Setting lock to UNSECURED');

  rpio.write(this.lockPin, this.activeState);
  this.service.setCharacteristic(Characteristic.LockCurrentState, state);
  this.currentState = state;
  this.targetState = state;
  this.storage.setItemSync(this.name, this.currentState);
  rpio.sleep(2);
  rpio.write(this.lockPin, this.initialState);
  if (this.doorPin) {
    if (rpio.read(this.doorPin)) {
      this.doorWasOpenedAfterUnlocking = true;
      rpio.poll(this.doorPin, this.secureLock.bind(this), this.pollTransition);
    } else {
      rpio.poll(this.doorPin, this.waitForDoorCycleAndSecureLock.bind(this));
    }
  } else {
    this.log('Setting lock to SECURED');
    this.service.setCharacteristic(Characteristic.LockTargetState, STATE_SECURED);
    this.service.setCharacteristic(Characteristic.LockCurrentState, STATE_SECURED);
    this.currentState = STATE_SECURED;
    this.targetState = STATE_SECURED;
    this.storage.setItemSync(this.name, this.currentState);
  }

  callback();
}

ElectromagneticLockAccessory.prototype.waitForDoorCycleAndSecureLock = function() {
  rpio.msleep(20);
  if (rpio.read(this.doorPin)) {
    this.doorWasOpenedAfterUnlocking = true;
    return;
  }
  this.secureLock();
}

ElectromagneticLockAccessory.prototype.secureLock = function() {
  if (!this.doorWasOpenedAfterUnlocking) {
    return;
  } 
  this.log('Setting lock to SECURED');
  this.service.setCharacteristic(Characteristic.LockTargetState, STATE_SECURED);
  this.service.setCharacteristic(Characteristic.LockCurrentState, STATE_SECURED);
  this.currentState = STATE_SECURED;
  this.targetState = STATE_SECURED;
  this.storage.setItemSync(this.name, this.currentState);
  this.doorWasOpenedAfterUnlocking = false;
  rpio.poll(this.doorPin, null);
}

ElectromagneticLockAccessory.prototype.isDoorOpen = function() {
  return this.doorPin && rpio.read(this.doorPin);
}

ElectromagneticLockAccessory.prototype.getServices = function() {
  return [this.infoService, this.service];
}
