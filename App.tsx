/* eslint-disable react-native/no-inline-styles */
import React, {useEffect, useState} from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  PermissionsAndroid,
  View,
  NativeEventEmitter,
  NativeModules,
  Text,
  TouchableHighlight,
  Platform,
} from 'react-native';
import Notification from './Notifications';
import BleManager, {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  BleStopScanEvent,
  Peripheral,
} from 'react-native-ble-manager';
import {Buffer} from 'buffer';

// APP
const supported_name = 'beverage_notifier';

// BLE constants
const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

// Helpers

/**
 * Get the service and characteristic uuids
 * Here we pull out the characteristing and service from the recieved data from the connected peripheral.
 * The data returns the properties as a list and we need to get the correct uuid values that match regex 128bit uuid
 * @param peripheralRetrievedInfo
 */

type CHARACTERISTIC = {
  characteristic: string;
  service: string;
  properties: unknown; // this we dont know or use for now
  descriptors?: unknown; // this we dont know or use for now
};

type SERVICE = {
  uuid: string;
};

function getServiceCharacteristic(peripheralRetrievedInfo: any) {
  let result: {
    service: string | null;
    characteristic: string | null;
  } = {
    service: null,
    characteristic: null,
  };

  const {services, characteristics} = peripheralRetrievedInfo;

  if (!services) {
    return result;
  }
  if (!characteristics) {
    return result;
  }

  // regular expression to make sure the value matches the type of uuid
  const regexUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // NOTE: NOT IDEAL TO LOOP AND REPLACE LATEST CHARACTERISTIC/SERVICE AS THERE CAN BE MANY
  // check services if we find a match
  services.forEach((element: SERVICE) => {
    // we make sure it is a uuid that we add
    if (regexUUID.test(element.uuid)) {
      result.service = element.uuid;
    }
  });

  // NOTE: NOT IDEAL TO LOOP AND REPLACE LATEST CHARACTERISTIC/SERVICE AS THERE CAN BE MANY
  //check characteristics if we find a match
  characteristics.forEach((element: CHARACTERISTIC) => {
    // we make sure it is a uuid that we add
    if (regexUUID.test(element.characteristic)) {
      result.characteristic = element.characteristic;
    }
  });

  return result;
}

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

  // rerenders when data changes or we can rerender the app data here
  useEffect(() => {
    // This happens after permissions - async functions
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

    // Ask permissions for services access
    handleAndroidPermissions();

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
    console.log(value);
    if (value < 30) {
      Notification.scheduleNotification({
        title: 'Beverage temps are getting colder...',
        body: `Current temps: ${value}`,
      });
    }
  }, [connectedDevice, deviceValue]);

  /**
   * Handle the permissions that needs to be asked and set before anything can be used
   */

  const handleAndroidPermissions = () => {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]).then(result => {
        if (result) {
          console.debug(
            '[handleAndroidPermissions] User accepts runtime permissions android 12+',
          );
        } else {
          console.error(
            '[handleAndroidPermissions] User refuses runtime permissions android 12+',
          );
        }
      });
    } else if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ).then(checkResult => {
        if (checkResult) {
          console.debug(
            '[handleAndroidPermissions] runtime permission Android <12 already OK',
          );
        } else {
          PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ).then(requestResult => {
            if (requestResult) {
              console.debug(
                '[handleAndroidPermissions] User accepts runtime permission android <12',
              );
            } else {
              console.error(
                '[handleAndroidPermissions] User refuses runtime permission android <12',
              );
            }
          });
        }
      });
    }
  };

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
    // clear the values regarless when a disconnect happens
    // we will check the use effect and scheduled based on the value
    setDeviceValue(null);
    // check if we had a device in memory to connect to
    if (connectedDevice !== null) {
      connect(connectedDevice);
      setDeviceStatus('Disconnected - lost connection. Reconnecting...');
      return;
    }

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
    if (isSupported(device.name)) {
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
   * The functions that can invoke functionality of trying to find, get and set peripherals
   */

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
        // remove from devices list and update state - we dont need to remove from list
        // we will however not be allowed to connect untill next start device cycle

        // const updated_devices = Object.assign({}, devices);
        // delete updated_devices[device.id];
        // setDeviceState({...updated_devices});
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
    // https://github.com/innoveit/react-native-ble-manager
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
          {deviceValue && (
            <View>
              <Text>: {deviceValue.value}</Text>
            </View>
          )}
        </>
      </TouchableHighlight>
    );
  };

  /**
   * Checks the support for crud made devices only - ignores the rest
   */
  const isSupported = (deviceName: Peripheral['name']) => {
    const charList = deviceName?.split('::') ?? ['']; // default to something that wont match
    return charList[charList.length - 1] === supported_name;
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

  return (
    <SafeAreaView style={[styles.container]}>
      <View style={[styles.container]}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={[styles.text_header]}>crud.sh</Text>
          <Text style={[styles.text_sub_header]}>beverage notifier</Text>
          <Text style={[styles.text_sub_header]}> --- </Text>
          <Text
            style={[
              styles.text_sub_header,
              styles.text_sm_italic,
              styles.text_w_300,
              {alignSelf: 'center'},
            ]}>
            {connectedDevice ? 'To disconnect from device, tap it again' : ' '}
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
    fontSize: 45,
  },
  text_sub_header: {
    fontSize: 20,
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
