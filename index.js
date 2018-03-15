var _ = require('underscore');
var rpio = require('rpio');
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-gpio-electromagnetic-lock', 'ElectromagneticLock', ElectromagneticLockAccessory);
}

function ElectromagneticLockAccessory(log, config) {
  _.defaults(config, {activeLow: true});

  this.log = log;
  this.name = config['name'];
  this.pin = config['pin'];
  this.initialState = config['activeLow'] ? rpio.HIGH : rpio.LOW;
  this.activeState = config['activeLow'] ? rpio.LOW : rpio.HIGH;

  this.service = new Service.LockMechanism(this.name);

  this.infoService = new Service.AccessoryInformation();
  this.infoService
    .setCharacteristic(Characteristic.Manufacturer, 'Radoslaw Sporny')
    .setCharacteristic(Characteristic.Model, 'RaspberryPi GPIO Electromagnetic Lock')
    .setCharacteristic(Characteristic.SerialNumber, 'Version 1.0.0');

  // use gpio pin numbering
  rpio.init({
    mapping: 'gpio'
  });
  rpio.open(this.pin, rpio.OUTPUT, this.initialState);

  this.service
    .getCharacteristic(Characteristic.LockCurrentState)
    .on('get', this.getState.bind(this));

  this.service
    .getCharacteristic(Characteristic.LockTargetState)
    .on('get', this.getState.bind(this))
    .on('set', this.setState.bind(this));
}

ElectromagneticLockAccessory.prototype.getState = function(callback) {
  callback(null, Characteristic.LockCurrentState.SECURED);
}

ElectromagneticLockAccessory.prototype.setState = function(state, callback) {
  if (state) { // can't lock electromagnetic with memory
    callback();
    return true;
  }
  this.log('Setting state to UNLOCKED');
  rpio.write(this.pin, this.activeState);
  this.service.setCharacteristic(Characteristic.LockCurrentState, state);
  setTimeout(function() {
    this.log('Setting state to LOCKED');
    rpio.write(this.pin, this.initialState);
    this.service.setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED);
    this.service.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED);
  }.bind(this), 2000);
  callback();
}

ElectromagneticLockAccessory.prototype.getServices = function() {
  return [this.infoService, this.service];
}
