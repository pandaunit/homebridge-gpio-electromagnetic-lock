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
  this.pin = config['pin'];
  this.reedSwitch = config['reedSwitch'];
  this.initialState = config['activeLow'] ? rpio.HIGH : rpio.LOW;
  this.activeState = config['activeLow'] ? rpio.LOW : rpio.HIGH;
  this.reedSwitchActiveState = config['reedSwitchActiveLow'] ? rpio.LOW : rpio.HIGH;
  this.pullResistor = config['reedSwitchActiveLow'] ? rpio.PULL_UP : rpio.PULL_DOWN;
  this.pollTransition = config['reedSwitchActiveLow'] ? rpio.POLL_LOW : rpio.POLL_HIGH;

  this.cacheDirectory = HomebridgeAPI.user.persistPath();
  this.storage = require('node-persist');
  this.storage.initSync({dir:this.cacheDirectory, forgiveParseErrors: true});

  var cachedCurrentState = this.storage.getItemSync(this.name);
  if((cachedCurrentState === undefined) || (cachedCurrentState === false)) {
		this.currentState = STATE_UNKNOWN;
	} else {
		this.currentState = cachedCurrentState;
	}

  this.service = new Service.LockMechanism(this.name);

  this.infoService = new Service.AccessoryInformation();
  this.infoService
    .setCharacteristic(Characteristic.Manufacturer, 'Radoslaw Sporny')
    .setCharacteristic(Characteristic.Model, 'RaspberryPi GPIO Electromagnetic Lock')
    .setCharacteristic(Characteristic.SerialNumber, 'Version 1.0.1');

  // use gpio pin numbering
  rpio.init({
    mapping: 'gpio'
  });
  rpio.open(this.pin, rpio.OUTPUT, this.initialState);
  if (this.reedSwitch) rpio.open(this.reedSwitch, rpio.INPUT, this.pullResistor);

  this.service
    .getCharacteristic(Characteristic.LockCurrentState)
    .on('get', this.getState.bind(this));

  this.service
    .getCharacteristic(Characteristic.LockTargetState)
    .on('get', this.getState.bind(this))
    .on('set', this.setState.bind(this));
}

ElectromagneticLockAccessory.prototype.getState = function(callback) {
  this.log("Current state: %s", this.currentState);
  this.log("Reed switch: %s", rpio.read(this.reedSwitch));
  callback(null, this.currentState);
}

ElectromagneticLockAccessory.prototype.setState = function(state, callback) {
  if (state) { // can't lock electromagnetic with memory
    callback();
    return true;
  }

  this.log('Setting state to UNLOCKED');

  rpio.write(this.pin, this.activeState);
  rpio.sleep(2);
  rpio.write(this.pin, this.initialState);
  if (this.reedSwitch) rpio.poll(this.reedSwitch, this.secureDoor, this.pollTransition)

  this.service.setCharacteristic(Characteristic.LockCurrentState, state);
  this.currentState = STATE_UNSECURED;

  callback();
}

ElectromagneticLockAccessory.prototype.secureDoor = function() {
  this.log('Setting state to LOCKED');
  this.service.setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED);
  this.service.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED);
  this.currentState = STATE_SECURED;
  rpio.poll(this.reedSwitch, null);
}

ElectromagneticLockAccessory.prototype.getServices = function() {
  return [this.infoService, this.service];
}
