import { withLDConsumer } from "launchdarkly-react-client-sdk";
import ldLogo from '../img/ldLogo_gray.svg';
import reactLogo from '../img/reactLogo.svg';
import { LDObserve } from '@launchdarkly/observability';
import { LDRecord } from '@launchdarkly/session-replay';

const homeLogo = ({ flags, ldClient }) => {
  // Use the showReactLogo flag for the frontend
  const flagValue = flags['showReactLogo'] !== undefined ? flags['showReactLogo'] : false;

  // Record flag evaluation with observability (only if available)
  try {
    LDObserve.recordLog('Frontend flag evaluation', 'info', {
      component: 'ClientLogo',
      flagKey: 'showReactLogo',
      flagValue: flagValue,
      flagType: typeof flagValue
    });

    // Record flag evaluation metric
    LDObserve.recordMetric({
      name: 'flag_evaluations_frontend',
      value: 1,
      tags: {
        flag_key: 'showReactLogo',
        flag_value: flagValue.toString(),
        component: 'ClientLogo'
      }
    });
  } catch (error) {
    // Observability not started yet, silently continue
    console.debug('Observability not available yet for flag evaluation logging');
  }

  // Session replay automatically records DOM changes and user interactions - no manual recording needed

  return flagValue ? (
    <div>
      <img src={reactLogo} className="App-logo" alt="React logo" style={{ height: '60px' }} />
      <p style={{ color: 'white', margin: '8px 0 0 0', fontSize: '14px' }}>The client-side feature flag evaluation is <b>TRUE</b></p>
    </div>
  ) : (
    <div>
      <img src={ldLogo} className="App-logo" alt="LaunchDarkly logo" style={{ height: '60px' }} />
      <p style={{ color: 'white', margin: '8px 0 0 0', fontSize: '14px' }}>The client-side feature flag evaluation is <b>FALSE</b></p>
    </div>
  );
};

export default withLDConsumer()(homeLogo);