# Homebridge GPIO Electromagnetic Lock
Homebridge plugin to control electromagnetic lock via Raspberry Pi GPIO pins.

## Motivation
I haven't found similar script working with Raspberry Pi GPIO.

## Installation
1. install homebridge
   `npm install -g homebridge`
2. install this plugin
   `npm install -g homebridge-gpio-electromagnetic-lock`
3. update your `~/.homebridge/config.json` file (use `sample-config.json` as a reference)

## Configuration
Sample accessory:
```
"accessories": [
  {
    "accessory": "ElectromagneticLock",
    "name": "Lock",
    "lockPin": 5,
    "doorPin": 16,
    "activeLow": false,
    "reedSwitchActiveLow": false,
    "unlockingDuration": 2,
    "lockWithMemory": true
  }
]
```

Fields:

- `accessory` must always be *ElectromagneticLock*
- `name` accessory name, e.g. *Lock*
- `lockPin` pin for unlocking lock (use *gpio numbering*, not *physical*)
- `doorPin` [optional] door contact sensor, ignored when *lockWithMemory* is set to false
- `activeLow` [optional, default: *true*] true: relay activated by low state (0), false: relay activated by high state (1), affects *lockPin*
- `reedSwitchActiveLow` [optional, default: *true*] true: reed switch activated by low state (0), false: reed switch activated by high state (1), affects *doorPin*
- `unlockingDuration` [optional, default: *2*] how long *lockPin* should be active (seconds)
- `lockWithMemory` [optional, default: *true*] true: electromagnetic lock that stays unlocked until full door cycle, false: stays unlocked only for *unlockingDuration* seconds

## Troubleshooting
- check platform: [Homebridge](https://github.com/nfarina/homebridge)
- check plugin dependency: [rpio](https://www.npmjs.com/package/rpio)
- or create issue

