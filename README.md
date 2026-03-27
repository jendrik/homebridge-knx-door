# homebridge-knx-door

Homebridge plugin for KNX Door & Window Contact Sensors.

Exposes KNX binary contact sensors (DPT 1.001) as HomeKit contact sensors, with Eve app history support including times opened, open/closed duration, and last activation.

## Requirements

- [Homebridge](https://homebridge.io/) v1.8.0 or later (including v2.0)
- Node.js v20.18 or later
- A KNX IP router or interface reachable on the network

## Installation

Install via the Homebridge UI by searching for `homebridge-knx-door`, or manually:

```sh
npm install -g @jendrik/homebridge-knx-door
```

## Configuration

Configure through the Homebridge UI, or add the following to your `config.json`:

```json
{
  "platforms": [
    {
      "platform": "knx-door",
      "ip": "224.0.23.12",
      "port": 3671,
      "devices": [
        {
          "name": "Front Door",
          "listen": "1/1/1"
        },
        {
          "name": "Kitchen Window",
          "listen": "1/1/2"
        }
      ]
    }
  ]
}
```

### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `platform` | Yes | `"knx-door"` | Must be `"knx-door"` |
| `ip` | No | `224.0.23.12` | IP address of the KNX router or interface (default is KNX/IP multicast) |
| `port` | No | `3671` | KNX/IP port |
| `devices` | Yes | | Array of contact sensor devices |

### Device Options

| Option | Required | Description |
|--------|----------|-------------|
| `name` | Yes | Display name for the sensor in HomeKit |
| `listen` | Yes | KNX group address to listen on (format: `x/x/x`) |

## Eve App Support

This plugin includes [fakegato-history](https://github.com/simont77/fakegato-history) integration, providing the following Eve app characteristics:

- **Times Opened** - total number of times the contact was opened
- **Open Duration** - cumulative time the contact has been open
- **Closed Duration** - cumulative time the contact has been closed
- **Last Activation** - timestamp of the last activation event

## Development

```sh
# Install dependencies
npm install

# Build
npm run build

# Lint
npm run lint

# Watch mode (builds and starts homebridge on changes)
npm run watch
```

## License

[Apache-2.0](LICENSE)
