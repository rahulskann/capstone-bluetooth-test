import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StatusBar,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Alert,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
} from 'react-native';

import { BleManager, Device, Characteristic } from 'react-native-ble-plx';

// String encoding/decoding for BLE
const Encoding = {
  // Convert string to bytes
  stringToBytes: (text: string): Uint8Array => {
    const encoded = encodeURIComponent(text);
    const length = encoded.length;
    const bytes = new Uint8Array(length);
    
    for (let i = 0; i < length; i++) {
      bytes[i] = encoded.charCodeAt(i);
    }
    
    return bytes;
  },
  
  // Convert bytes to string
  bytesToString: (buffer: any): string => {
    try {
      return decodeURIComponent(String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer))));
    } catch (error) {
      // Fallback for invalid UTF-8
      return String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer)));
    }
  }
};

const manager = new BleManager();

// Using standard UUIDs for better compatibility
const SERVICE_UUID = '180A';  // Device Information Service
const CHARACTERISTIC_UUID = '2A24';  // Model Number String

// Dark theme colors
const DarkTheme = {
  background: '#121212',
  surface: '#1E1E1E',
  primary: '#BB86FC',
  accent: '#03DAC6',
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  success: '#4CAF50',
  error: '#F44336',
};

function App(): React.JSX.Element {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [receivedData, setReceivedData] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [command, setCommand] = useState<string>('');

  const requestBlePermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        const allGranted = Object.values(granted).every(
          (result) => result === PermissionsAndroid.RESULTS.GRANTED
        );
        if (!allGranted) {
          Alert.alert(
            'Permissions Required',
            'Bluetooth and Location permissions are needed.'
          );
        }
      } catch (error) {
        console.warn('Permission error:', error);
      }
    }
  };

  useEffect(() => {
    requestBlePermissions();
    return () => {
      // Clean up subscriptions
      if (connectedDevice) {
        manager.cancelDeviceConnection(connectedDevice.id);
      }
      manager.destroy();
    };
  }, [connectedDevice]);

  const scanForDevices = () => {
    setDevices([]); // Clear old devices
    setIsScanning(true);
    setMessage('Scanning for Portenta device...');

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.warn('Scan error:', error);
        setIsScanning(false);
        setMessage(`Scan error: ${error.message}`);
        return;
      }

      if (device) {
        // Log every device for debugging
        console.log(`Found device: ${device.name || 'Unknown'} (${device.id})`);
        
        // For Portenta, the device name should be "Portenta"
        if (device.name === 'Portenta') {
          console.log('Found Portenta device!');
          
          // Stop scanning once we find our device
          manager.stopDeviceScan();
          setIsScanning(false);
          
          // Store the device
          setDevices([device]);
          setMessage('Found Portenta device! Tap to connect.');
          return;
        }
        
        // Add any named device to the list for testing
        if (device.name) {
          setDevices((prevDevices) => {
            const exists = prevDevices.find((d) => d.id === device.id);
            if (!exists) {
              return [...prevDevices, device];
            }
            return prevDevices;
          });
        }
      }
    });

    // Stop scanning after 15 seconds
    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
      if (devices.length === 0) {
        setMessage('No Portenta device found. Make sure it is powered on and try again.');
      }
    }, 15000);
  };

  const connectToDevice = async (device: Device) => {
    try {
      setIsConnecting(true);
      setMessage(`Connecting to ${device.name || device.id}...`);
      
      // Connect with a timeout
      const connectedDevice = await manager.connectToDevice(device.id, {
        timeout: 5000, // 5 second timeout
        autoConnect: false,  // Don't auto connect
      });
      
      setMessage('Device connected, setting up...');
      
      // Wait for services and characteristics
      await connectedDevice.discoverAllServicesAndCharacteristics();
      
      // Log all services
      const services = await connectedDevice.services();
      console.log('Services found:', services.map(s => s.uuid).join(', '));
      
      // Set up notification for data reception
      connectedDevice.monitorCharacteristicForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (error) {
            console.warn('Notification error:', error);
            return;
          }
          
          if (characteristic?.value) {
            try {
              // Decode the binary value to string
              const value = Encoding.bytesToString(characteristic.value);
              console.log('Received data:', value);
              
              // Get current timestamp
              const timestamp = new Date().toLocaleTimeString();
              
              // Add to message history with timestamp
              setReceivedData(prev => `[${timestamp}] Received: ${value}\n` + prev);
            } catch (decodeError) {
              console.warn('Error decoding value:', decodeError);
              setReceivedData(prev => `[${new Date().toLocaleTimeString()}] Error decoding data\n` + prev);
            }
          }
        }
      );
      
      // Update UI
      setConnectedDevice(connectedDevice);
      setMessage('Connected to Portenta');
      
      // Send a test message
      try {
        const testMessage = Base64.encode('TEST');
        await connectedDevice.writeCharacteristicWithoutResponseForService(
          SERVICE_UUID,
          CHARACTERISTIC_UUID,
          testMessage
        );
      } catch (writeError) {
        console.log('Test message write error:', writeError);
      }
      
    } catch (error) {
      console.warn('Connection error:', error);
      setMessage(`Connection failed: ${error.message}`);
      
      try {
        await manager.cancelDeviceConnection(device.id);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectDevice = async () => {
    if (connectedDevice) {
      try {
        await manager.cancelDeviceConnection(connectedDevice.id);
        setConnectedDevice(null);
        setMessage('Device disconnected');
        setReceivedData('');
      } catch (error) {
        console.warn('Disconnect error:', error);
        setMessage(`Disconnect failed: ${error}`);
      }
    }
  };

  const sendCommand = async () => {
    if (!connectedDevice || !command) return;

    try {
      // Create a simple text message
      const message = command;
      console.log('Sending message:', message);
      
      // Log attempt to UI
      setMessage('Sending message...');
      
      // Convert text to bytes
      const bytes = Encoding.stringToBytes(message);
      
      // Write with response
      await connectedDevice.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        bytes.buffer
      );
      
      // Success - log the message
      const timestamp = new Date().toLocaleTimeString();
      setReceivedData(prev => `[${timestamp}] Sent: ${command}\n` + prev);
      
      // Reset input
      setCommand('');
      setMessage('Message sent successfully');
    } catch (error) {
      console.warn('Send error:', error);
      
      // Detailed error message
      if (error instanceof Error) {
        setMessage(`Send failed: ${error.message}`);
      } else {
        setMessage('Failed to send message');
      }
    }
  };

  const renderDevice = ({ item }: { item: Device }) => (
    <TouchableOpacity 
      style={styles.deviceContainer}
      onPress={() => connectToDevice(item)}
    >
      <Text style={styles.deviceText}>{item.name || 'Unknown Device'}</Text>
      <Text style={styles.deviceId}>ID: {item.id}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.background}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={DarkTheme.background}
      />
      <ScrollView style={styles.background}>
        <View style={styles.container}>
          <Text style={styles.title}>Portenta BLE Messenger</Text>
          
          {!connectedDevice ? (
            <>
              <TouchableOpacity 
                style={styles.button}
                onPress={scanForDevices}
                disabled={isScanning}
              >
                <Text style={styles.buttonText}>
                  {isScanning ? 'Scanning...' : 'Scan for Devices'}
                </Text>
                {isScanning && (
                  <ActivityIndicator 
                    color={DarkTheme.background} 
                    style={{marginLeft: 10}} 
                  />
                )}
              </TouchableOpacity>
              
              {devices.length > 0 && (
                <Text style={styles.sectionTitle}>
                  Available Devices
                </Text>
              )}
              
              <FlatList
                data={devices}
                keyExtractor={(item) => item.id}
                renderItem={renderDevice}
                style={styles.deviceList}
              />
            </>
          ) : (
            <>
              <View style={styles.connectedDeviceInfo}>
                <Text style={styles.connectedDeviceTitle}>
                  Connected to: {connectedDevice.name || 'Unknown Device'}
                </Text>
                <TouchableOpacity 
                  style={styles.disconnectButton}
                  onPress={disconnectDevice}
                >
                  <Text style={styles.disconnectButtonText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.commandSection}>
                <Text style={styles.sectionTitle}>Send Message</Text>
                <View style={styles.commandRow}>
                  <TextInput
                    style={styles.commandInput}
                    value={command}
                    onChangeText={setCommand}
                    placeholder="Type your message..."
                    placeholderTextColor={DarkTheme.textSecondary}
                  />
                  <TouchableOpacity 
                    style={styles.sendButton}
                    onPress={sendCommand}
                    disabled={!command}
                  >
                    <Text style={styles.sendButtonText}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.responseSection}>
                <Text style={styles.sectionTitle}>Message History</Text>
                <View style={styles.responseContainer}>
                  <Text style={styles.responseText}>
                    {receivedData || 'No messages yet'}
                  </Text>
                </View>
              </View>
            </>
          )}
          
          {message ? (
            <Text style={styles.messageText}>{message}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: DarkTheme.background,
  },
  container: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 20,
    color: DarkTheme.text,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
    color: DarkTheme.text,
  },
  button: {
    backgroundColor: DarkTheme.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonText: {
    color: DarkTheme.background,
    fontSize: 16,
    fontWeight: '600',
  },
  deviceList: {
    marginTop: 10,
  },
  deviceContainer: {
    padding: 16,
    marginBottom: 10,
    backgroundColor: DarkTheme.surface,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: DarkTheme.accent,
  },
  deviceText: {
    fontSize: 16,
    color: DarkTheme.text,
    fontWeight: '500',
  },
  deviceId: {
    fontSize: 12,
    color: DarkTheme.textSecondary,
    marginTop: 4,
  },
  messageText: {
    marginTop: 20,
    padding: 12,
    color: DarkTheme.textSecondary,
    backgroundColor: DarkTheme.surface,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: DarkTheme.primary,
  },
  connectedDeviceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: DarkTheme.surface,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  connectedDeviceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: DarkTheme.text,
    flex: 1,
  },
  disconnectButton: {
    backgroundColor: DarkTheme.error,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  disconnectButtonText: {
    color: DarkTheme.text,
    fontSize: 14,
    fontWeight: '500',
  },
  commandSection: {
    marginBottom: 20,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commandInput: {
    flex: 1,
    backgroundColor: DarkTheme.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: DarkTheme.text,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: DarkTheme.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  sendButtonText: {
    color: DarkTheme.background,
    fontSize: 14,
    fontWeight: '600',
  },
  responseSection: {
    marginBottom: 20,
  },
  responseContainer: {
    backgroundColor: DarkTheme.surface,
    borderRadius: 8,
    padding: 16,
    maxHeight: 200,
  },
  responseText: {
    color: DarkTheme.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
  },
});

export default App;
