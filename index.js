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
  _.defaults(config, {activeLow: true, reedSwitchActiveLow: true, unlockingDuration: 2, lockWithMemory: true});

  this.log = log;
  this.name = config['name'];
  this.lockPin = config['lockPin'];
  this.doorPin = config['doorPin'];
  this.initialState = config['activeLow'] ? rpio.HIGH : rpio.LOW;
  this.activeState = config['activeLow'] ? rpio.LOW : rpio.HIGH;
  this.reedSwitchActiveState = config['reedSwitchActiveLow'] ? rpio.LOW : rpio.HIGH;
  this.unlockingDuration = config['unlockingDuration'];
  this.lockWithMemory = config['lockWithMemory'];

  this.cacheDirectory = HomebridgeAPI.user.persistPath();
  this.storage = require('node-persist');
  this.storage.initSync({dir:this.cacheDirectory, forgiveParseErrors: true});

  var cachedCurrentState = this.storage.getItemSync(this.name);
  if((cachedCurrentState === undefined) || (cachedCurrentState === false)) {
    this.currentState = STATE_UNKNOWN;
  } else {
    this.currentState = cachedCurrentState;
  }

  this.lockState = this.currentState;
  if (this.currentState == STATE_UNKNOWN) {
    this.targetState = STATE_SECURED;
  } else {
    this.targetState = this.currentState;
  }

  this.service = new Service.LockMechanism(this.name);

  this.infoService = new Service.AccessoryInformation();
  this.infoService
    .setCharacteristic(Characteristic.Manufacturer, 'Panda Unit')
    .setCharacteristic(Characteristic.Model, 'RaspberryPi GPIO Electromagnetic Lock')
    .setCharacteristic(Characteristic.SerialNumber, 'Version 1.1.1');

  this.unlockTimeout;

  // use gpio pin numbering
  rpio.init({mapping: 'gpio'});
  rpio.open(this.lockPin, rpio.OUTPUT, this.initialState);

  if (this.doorPin && !this.lockWithMemory) {
    this.log("Electromagnetic lock without memory doesn't support doorPin, setting to null. Consider using separate contact sensor.");
    this.doorPin = undefined;
  }

  if (this.doorPin) {
    rpio.open(this.doorPin, rpio.INPUT, rpio.PULL_UP);
    if (this.lockWithMemory) {
      rpio.poll(this.doorPin, this.calculateLockWithMemoryState.bind(this));
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
  this.log("Lock current state: %s", this.currentState);
  callback(null, this.currentState);
}

ElectromagneticLockAccessory.prototype.getTargetState = function(callback) {
  this.log("Lock target state: %s", this.targetState);
  callback(null, this.targetState);
}

ElectromagneticLockAccessory.prototype.setTargetState = function(state, callback) {
  this.log('Setting lock to %s', state ? 'secured' : 'unsecured');
  if (state && this.lockWithMemory) {
    this.log("Can't lock electromagnetic lock with memory.");
    this.service.updateCharacteristic(Characteristic.LockCurrentState, state);
    setTimeout(function() {
      this.service.updateCharacteristic(Characteristic.LockTargetState, this.targetState);
      this.service.updateCharacteristic(Characteristic.LockCurrentState, this.currentState);
    }.bind(this), 500);
    callback();
  } else if (state && !this.lockWithMemory) {
    clearTimeout(this.unlockTimeout);
    this.secureLock();
    callback();
  } else {
    rpio.write(this.lockPin, this.activeState);
    this.service.setCharacteristic(Characteristic.LockCurrentState, state);
    this.lockState = state;
    this.storage.setItemSync(this.name, this.lockState);
    this.unlockTimeout = setTimeout(this.secureLock.bind(this), this.unlockingDuration*1000);
    callback();
  }
}

ElectromagneticLockAccessory.prototype.calculateLockWithMemoryState = function() {
  rpio.msleep(20);
  let doorOpen = rpio.read(this.doorPin) ? true : false;
  if (doorOpen && this.lockState == STATE_UNSECURED) {
    this.log('Door has been opened, lock: secured, current state: unsecured.');
    this.lockState = STATE_SECURED;
    this.currentState = STATE_UNSECURED;
    this.targetState = STATE_UNSECURED;
  } else if (doorOpen && this.lockState == STATE_SECURED) {
    this.log('Door has been opened, lock already secured, current state: unsecured.');
    this.currentState = STATE_UNSECURED;
    this.targetState = STATE_UNSECURED;
  } else if (!doorOpen && this.lockState == STATE_SECURED) {
    this.log('Door has been closed, lock already secured, current state: secured.');
    this.currentState = STATE_SECURED;
    this.targetState = STATE_SECURED;
  } else if (!doorOpen && this.lockState == STATE_UNSECURED) {
    this.log('Door has been closed, lock: unsecured, current state: unsecured.');
    this.currentState = STATE_UNSECURED;
    this.targetState = STATE_UNSECURED;
  } else {
    this.log('State unknown, door open: ' + doorOpen + ', lock state: ' + this.lockState);
    this.lockState == STATE_UNKNOWN;
    this.currentState = STATE_UNKNOWN;
  }
  this.service.updateCharacteristic(Characteristic.LockTargetState, this.targetState);
  this.service.updateCharacteristic(Characteristic.LockCurrentState, this.currentState);
  this.storage.setItemSync(this.name, this.currentState);
}

ElectromagneticLockAccessory.prototype.secureLock = function() {
  rpio.write(this.lockPin, this.initialState);
    if (!this.doorPin && !this.lockWithMemory) {
      this.service.updateCharacteristic(Characteristic.LockTargetState, STATE_SECURED);
      this.service.updateCharacteristic(Characteristic.LockCurrentState, STATE_SECURED);
      this.currentState = STATE_SECURED;
      this.targetState = STATE_SECURED;
      this.storage.setItemSync(this.name, this.currentState);
    } else if (!this.doorPin && this.lockWithMemory) {
      this.service.updateCharacteristic(Characteristic.LockTargetState, STATE_SECURED);
      this.service.updateCharacteristic(Characteristic.LockCurrentState, STATE_SECURED);
      this.service.updateCharacteristic(Characteristic.LockCurrentState, STATE_UNKNOWN);
      this.currentState = STATE_UNKNOWN;
      this.targetState = STATE_SECURED;
      this.storage.setItemSync(this.name, this.currentState);
    }
}

ElectromagneticLockAccessory.prototype.getServices = function() {
  return [this.infoService, this.service];
}
