// Solana libraries expect Node's crypto; react-native-quick-crypto provides it. This must run before anything else.
import { install } from 'react-native-quick-crypto';

install();
