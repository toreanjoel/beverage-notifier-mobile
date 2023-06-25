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
} from 'react-native-ble-manager'; // Peripheral, // BleScanMode, // BleScanMatchMode, // BleScanCallbackType, // BleManagerDidUpdateValueForCharacteristicEvent, // BleDisconnectPeripheralEvent,
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
    // BleManager.stopScan().then(resp => {
    //   // Success code
    //   console.log('Scan stopped', resp);
    //   setScanningState(false);
    // });
    console.log('Stop Scanning', event);
    setScanningState(false);
  };

  /**
   * Disconnect
   */
  const handleDisconnected = (event: BleDisconnectPeripheralEvent) => {
    setConnectedDevice(null);
    setTimeout(() => {
      connect(devices[event.peripheral]);
    }, 1000);
    console.log('Disconnected', event);
  };

  /**
   * Characteristing Value Update
   */
  const handleCharacteristicValueUpdate = (
    data: BleManagerDidUpdateValueForCharacteristicEvent,
  ) => {
    // set scanning state - true
    console.log('characteristic value update', data);
  };

  /**
   * Characteristing Value Update
   */
  const handleDiscover = (device: Peripheral) => {
    console.log('device - found', device);
    // set scanning state - true
    setDeviceState({...devices, ...{[device.id]: device}}); // the type data does not match for device found
  };

  /**
   * bond
   */
  const bond = async (device: Peripheral) => {
    BleManager.createBond(device.id)
      .then(() => {
        console.log('createBond success or there is already an existing one');
      })
      .catch(error => {
        console.log('fail to bond', error);
      });
  };

  /**
   * The functions that can invoke functionality of trying to find, get and set peripherals
   */

  /**
   * disconnect from peripheral
   */
  const disconnect = (device: Peripheral) => {
    // set scanning state - true
    BleManager.disconnect(device.id)
      .then(() => {
        device;
        // Success code
        setConnectedDevice(null);
        console.log('Disconnected');
      })
      .catch(error => {
        // Failure code
        console.log(error);
      });
  };

  /**
   * connect to peripheral
   */
  const connect = async (device: Peripheral) => {
    // we try to connect to the device here
    console.log('connect', device);
    BleManager.connect(device.id, {autoconnect: true})
      .then(() => {
        // Success code
        setConnectedDevice(device);
        console.log('Connected');
        bond(device);
      })
      .catch(error => {
        // Failure code
        console.log(error);
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
    BleManager.scan([], 2, false).then(() => {
      // Success code
      console.log('Scan started');
    });
  };

  /**
   * Stop Scanning
   */
  const stopScanning = () => {
    BleManager.stopScan().then(resp => {
      // Success code
      console.log('Scan stopped', resp);
      setScanningState(false);
    });
    setScanningState(false);
  };

  const renderItem = (item: Peripheral) => {
    const activeConnectedMatch = connectedDevice?.id === item.id;
    return (
      <TouchableHighlight
        style={[styles.item, activeConnectedMatch ? styles.activeDevice : {}]}
        onPress={() =>
          activeConnectedMatch ? disconnect(item) : connect(item)
        }
        key={item.id}>
        <View>
          <Text>Name: {item.name}</Text>
          <Text>RSSI: {item.rssi}</Text>
          <Text>ID: {item.id}</Text>
        </View>
      </TouchableHighlight>
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
          <Text style={[styles.text_header]}> crud.sh </Text>
          <Text style={[styles.text_sub_header]}> ☕ == 🧊 </Text>
        </View>
        <ScrollView style={[styles.section_content]}>
          {Object.keys(devices).map(id => renderItem(devices[id]))}
        </ScrollView>
        <View>
          {/* We toggle between scan and stop state */}
          {!isScanning ? (
            <Button title="Scan" onPress={startScan} />
          ) : (
            <Button title="Stop Searching" onPress={stopScanning} />
          )}
          <Button
            title="Notfification (manual)"
            onPress={() => {
              Notification.scheduleNotification({});
            }}
          />
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
    flex: 4,
  },
  item: {
    padding: 10,
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
});

export default App;
