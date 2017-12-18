var _ = require('underscore');
var rpio = require('rpio');
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-gpio-stateless-switch', 'StatelessSwitch', StatelessSwitchAccessory);
}

function StatelessSwitchAccessory(log, config) {
  _.defaults(config, {activeLow: true});

  this.log = log;
  this.name = config['name'];
  this.pin = config['pin'];
  this.initialState = config['activeLow'] ? rpio.HIGH : rpio.LOW;
  this.activeState = config['activeLow'] ? rpio.LOW : rpio.HIGH;

  this.service = new Service.Switch(this.name);

  this.infoService = new Service.AccessoryInformation();
  this.infoService
    .setCharacteristic(Characteristic.Manufacturer, 'Radoslaw Sporny')
    .setCharacteristic(Characteristic.Model, 'RaspberryPi GPIO Stateless Switch')
    .setCharacteristic(Characteristic.SerialNumber, 'Version 1.0.0');

  // use gpio pin numbering
  rpio.init({
    mapping: 'gpio'
  });
  rpio.open(this.pin, rpio.OUTPUT, this.initialState);

  this.service
    .getCharacteristic(Characteristic.On)
    .on("get", this.getStatus.bind(this))
    .on('set', this.setStatus.bind(this));
}

StatelessSwitchAccessory.prototype.getStatus = function(callback) {
  callback(null, false);
}

StatelessSwitchAccessory.prototype.setStatus = function(value, callback) {
  if (!value) {
    callback();
    return true;
  }
  this.log('Setting switch on');
  rpio.write(this.pin, this.activeState);
  setTimeout(function() {
    this.log('Setting switch off');
    rpio.write(this.pin, this.initialState);
    this.service.setCharacteristic(Characteristic.On, false);
  }.bind(this), 2000);
  callback();
}

StatelessSwitchAccessory.prototype.getServices = function() {
  return [this.infoService, this.service];
}
