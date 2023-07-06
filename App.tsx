/* eslint-disable react-native/no-inline-styles */
import React, {useEffect, useState} from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  NativeEventEmitter,
  NativeModules,
  Text,
  TouchableHighlight,
} from 'react-native';
import Notification from './Notifications';
import BleManager, {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  BleStopScanEvent,
  Peripheral,
} from 'react-native-ble-manager';
import {Buffer} from 'buffer';
import {TEMP_NOTIFIER_THRESHOLD, TEMP_LOW, TEMP_MED} from './constants';
import {getServiceCharacteristic, isPeripheralSupported} from './helpers';
import Notifications from './Notifications';

// BLE constants
const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

function App(): JSX.Element {
  const [isScanning, setScanningState] = useState<boolean>(false);
  const [devices, setDeviceState] = useState<
    Record<Peripheral['id'], Peripheral>
  >({});
  const [connectedDevice, setConnectedDevice] = useState<Peripheral | null>(
    null,
  );
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null);
  const [deviceValue, setDeviceValue] = useState<{
    peripheral: string;
    value: number;
  } | null>(null);

  /**
   * rerenders when data changes or we can rerender the app data here
   */
  useEffect(() => {
    // Request permissions
    Notifications.checkPermissions();

    try {
      BleManager.start()
        .then(() => console.debug('BleManager started.'))
        .catch(error =>
          console.error('BeManager could not be started.', error),
        );
    } catch (error) {
      console.error('unexpected error starting BleManager.', error);
      return;
    }

    // the listeners to add that we can use with functions to get data
    const listeners = [
      bleManagerEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        handleDiscover,
      ),
      // dont need for now as we only scan for a few seconds
      bleManagerEmitter.addListener('BleManagerStopScan', handleStopScanning),
      bleManagerEmitter.addListener(
        'BleManagerDisconnectPeripheral',
        handleDisconnected,
      ),
      bleManagerEmitter.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        handleCharacteristicValueUpdate,
      ),
    ];

    return () => {
      console.debug('[app] main component unmounting. Removing listeners...');
      for (const listener of listeners) {
        listener.remove();
      }
    };
  });

  /**
   * Check if the value changes and is not nil on a connected device
   */
  useEffect(() => {
    if (!connectedDevice) {
      return;
    }

    if (!deviceValue) {
      return;
    }

    const {value} = deviceValue;
    console.log('value', value);
    if (value < TEMP_NOTIFIER_THRESHOLD) {
      Notification.scheduleNotification({
        title: 'Beverage temps are getting colder...',
        body: `Current temps: ${value}`,
      });
    }
  }, [connectedDevice, deviceValue]);

  /**
   * Callback functions that run based on the listeners and side effects than happened.
   * The usage can be found above when connecting the component we listen on events.
   */

  /**
   * Stop scanning for devices
   */
  const handleStopScanning = (event: BleStopScanEvent) => {
    // // set scanning state - true
    console.log('Stop Scanning', event);
    setScanningState(false);
    setDeviceStatus('Stopped scanning');
  };

  /**
   * Disconnect
   */
  const handleDisconnected = (event: BleDisconnectPeripheralEvent) => {
    // we will check the use effect and scheduled based on the value

    // check if we had a device in memory to connect to
    if (connectedDevice !== null) {
      connect(connectedDevice);
      setDeviceStatus('Disconnected - lost connection. Reconnecting...');
      return;
    }

    // clear the values regarless when a disconnect happens
    setDeviceValue(null);
    setDeviceStatus('Disconnected - lost connection');
    console.log('Disconnected - lost connection to device', event);
  };

  /**
   * Characteristing Value Update
   */
  const handleCharacteristicValueUpdate = (
    data: BleManagerDidUpdateValueForCharacteristicEvent,
  ) => {
    // set scanning state - true
    console.log('characteristic value update', data);
    setDeviceStatus('Characteristic value update');

    // we take the value and workout an average that we can set as the "last value"
    setDeviceValue({
      peripheral: data.peripheral,
      value: Number(Buffer.from(data.value).toString()),
    });
  };

  /**
   * Characteristing Value Update
   */
  const handleDiscover = (device: Peripheral) => {
    // we only add the devices supported
    if (isPeripheralSupported(device.name)) {
      setDeviceState({...devices, ...{[device.id]: device}}); // the type data does not match for device found
      setDeviceStatus('Devices found');
    }
  };

  /**
   * bond
   */
  const bond = async (device: Peripheral) => {
    BleManager.createBond(device.id)
      .then(() => {
        console.log('createBond success or there is already an existing one');
        setDeviceStatus('Bonding success');
      })
      .catch(error => {
        console.log('fail to bond', error);
        setDeviceStatus('Bonding failed');
      });
  };

  /**
   * disconnect from peripheral
   */
  const disconnect = (device: Peripheral) => {
    // Remove device from memory
    setConnectedDevice(null);

    BleManager.disconnect(device.id)
      .then(() => {
        setDeviceStatus('Disconnect success');
        console.log('Disconnected');
      })
      .catch(error => {
        // Failure code
        console.log(error);
        setDeviceStatus('Disconnect error');
      });
  };

  /**
   * connect to peripheral
   */
  const connect = async (device: Peripheral) => {
    // we try to connect to the device here
    console.log('connect', device);
    setDeviceStatus('Connecting...');
    BleManager.connect(device.id, {autoconnect: true})
      .then(() => {
        // Success code
        setConnectedDevice(device);
        setDeviceStatus('Connect success');
        bond(device);
        // Here we get the services connected to the periferal, log out the data
        getAndconnectToService(device);
      })
      .catch(error => {
        // Failure code
        console.log(error);
        setDeviceStatus('Connect error');
      });
  };

  /**
   * Get the services connected to the periferal and use the device id to get the characteristic
   */
  const getAndconnectToService = async (device: Peripheral) => {
    console.log('getAndconnectToService - device', device);
    BleManager.retrieveServices(device.id)
      .then(peripheralInfo => {
        // Success code
        console.log('Peripheral info:', peripheralInfo);
        // Here we need to start notification and start listening on the UUIDs we are connected to
        const {characteristic, service} =
          getServiceCharacteristic(peripheralInfo);

        // we make sure the data exists
        if (service && characteristic) {
          startServiceNotificationListener(device.id, service, characteristic);
        }
      })
      .catch(error =>
        console.log('There was an error retrieving services', error),
      );
  };

  /**
   *
   */
  const startServiceNotificationListener = async (
    peripheralId: Peripheral['id'],
    serviceId: string,
    characteristicId: string,
  ) => {
    BleManager.startNotification(peripheralId, serviceId, characteristicId)
      .then(() => {
        // Success code
        console.log(
          'Notification started - listening on the data for periferal service/characteristic',
        );
      })
      .catch(error => {
        // Failure code
        console.log(
          'There was an error starting the notification listener for peripheral serivice/characteristic id',
          error,
        );
      });
  };

  /**
   * Scan for devices nearby
   */
  const startScan = () => {
    setDeviceState({});
    setScanningState(true);
    console.log('scanning started');
    BleManager.scan([], 1, false)
      .then(() => {
        // Success code
        console.log('Scan started');
        setDeviceStatus('Scanning');
      })
      .catch(_err => {
        setDeviceStatus('Scanning error');
      });
  };

  /**
   * Stop Scanning
   */
  const stopScanning = () => {
    BleManager.stopScan()
      .then(resp => {
        // Success code
        console.log('Scan stopped', resp);
        setScanningState(false);
        setDeviceStatus('Scanning stop');
      })
      .catch(_err => {
        setDeviceStatus('Scanning stop error');
      });
    setScanningState(false);
  };

  /**
   * Item for the BLE devices to connect to
   */
  const renderItem = (item: Peripheral) => {
    const activeConnectedMatch = connectedDevice?.id === item.id;
    return (
      <TouchableHighlight
        style={[styles.item, activeConnectedMatch ? styles.activeDevice : {}]}
        onPress={() =>
          !activeConnectedMatch ? connect(item) : disconnect(item)
        }
        key={item.id}>
        <>
          <View>
            <Text>Name: {item.name}</Text>
            <Text>RSSI: {item.rssi}</Text>
            <Text>ID: {item.id}</Text>
          </View>
        </>
      </TouchableHighlight>
    );
  };

  /**
   * Renders a no devices view
   * @returns
   */
  const renderNoDevices = () => {
    return (
      <View style={[styles.container]}>
        <Text style={{color: '#222222', fontSize: 20, alignSelf: 'center'}}>
          {' '}
          No devices to show
        </Text>
      </View>
    );
  };

  /**
   * Temp styles for the UI
   */
  const renderTempIndicatorStyle = (temp: any) => {
    if (temp <= TEMP_LOW) {
      return styles.temp_reading_low;
    }
    if (temp > TEMP_LOW && temp < TEMP_MED) {
      return styles.temp_reading_med;
    }
    return styles.temp_reading_high;
  };

  return (
    <SafeAreaView style={[styles.container]}>
      <View style={[styles.container]}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={[styles.text_header]}>beverage notifier</Text>
          <Text style={[styles.text_sub_header]}>crud.sh</Text>
          <Text
            style={[
              styles.text_sub_header,
              styles.text_sm_italic,
              styles.text_w_300,
              {alignSelf: 'center'},
            ]}>
            {deviceValue && (
              <Text
                style={[
                  renderTempIndicatorStyle(deviceValue.value),
                ]}>{`${deviceValue.value}°C`}</Text>
            )}
          </Text>
        </View>
        {!isScanning ? (
          <>
            {!connectedDevice ? (
              <ScrollView style={[styles.section_content]}>
                {/* Do we have devices? */}
                {Object.keys(devices).length === 0
                  ? renderNoDevices()
                  : Object.keys(devices).map(id => renderItem(devices[id]))}
              </ScrollView>
            ) : (
              <View style={[styles.container]}>
                {renderItem(connectedDevice)}
              </View>
            )}
          </>
        ) : (
          <View style={[styles.container]}>
            <Text style={{alignSelf: 'center'}}>Searching...</Text>
          </View>
        )}
        <View>
          {deviceStatus && (
            <Text style={[styles.text_sm_italic, {alignSelf: 'center'}]}>
              {deviceStatus}
            </Text>
          )}
          {!isScanning ? (
            <Button
              title={
                connectedDevice
                  ? 'Disconnect previous device before searching'
                  : 'Scan'
              }
              disabled={!!connectedDevice}
              onPress={startScan}
            />
          ) : (
            <Button
              title="Stop Searching"
              disabled={!!connectedDevice}
              onPress={stopScanning}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#000',
  },
  section_content: {
    flex: 1,
  },
  item: {
    padding: 10,
    backgroundColor: '#111111',
  },
  activeDevice: {
    backgroundColor: '#2b2b2b',
  },
  text_header: {
    fontSize: 30,
  },
  text_sub_header: {
    fontSize: 20,
  },
  temp_reading_high: {
    fontSize: 35,
    color: '#cb8d85',
  },
  temp_reading_med: {
    fontSize: 35,
    color: '#cbcb85',
  },
  temp_reading_low: {
    fontSize: 35,
    color: '#85cbbe',
  },
  text_sm_italic: {
    padding: 5,
    fontSize: 13,
    fontStyle: 'italic',
  },
  text_w_300: {
    maxWidth: 300,
  },
});

export default App;
