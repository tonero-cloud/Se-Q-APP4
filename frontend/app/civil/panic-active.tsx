// ... imports ...
import * as Location from 'expo-location';
import { BackHandler } from 'react-native';
import { useEffect, useRef } from 'react';

// Inside component:
const hasActivated = useRef(false);
const hasGotFreshGPS = useRef(false);

useEffect(() => {
  const activatePanic = async () => {
    if (hasActivated.current) return;
    hasActivated.current = true;

    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      alert('Location permission denied');
      return;
    }

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
      maximumAge: 0,
      timeout: 10000,
    });

    hasGotFreshGPS.current = true;

    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(`${BACKEND_URL}/panic/activate`, {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        user_id: currentUserId, // from context or storage
      }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      console.error('Panic activation failed', e);
    }
  };

  activatePanic();

  const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
    // Prevent back navigation during panic
    return true;
  });

  return () => backHandler.remove();
}, []);

// "I'm Safe Now" handler
const handleSafeNow = async () => {
  try {
    const token = await AsyncStorage.getItem('token');
    // Assume panicId stored in state or context after activation
    await axios.post(`${BACKEND_URL}/panic/deactivate`, { panic_id: activePanicId }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Force exit on Android
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    } else {
      // iOS: best effort — go to auth
      router.replace('/auth/pin');
    }
  } catch (e) {
    alert('Failed to deactivate panic');
  }
};

// UI: big red button for "I'm Safe Now"
// ... rest of your panic screen UI ...
