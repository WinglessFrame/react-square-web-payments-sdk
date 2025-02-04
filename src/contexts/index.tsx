// Vendor Modules
import {
  ChargeVerifyBuyerDetails,
  payments,
  StoreVerifyBuyerDetails,
  TokenResult,
} from '@square/web-sdk';
import * as React from 'react';
import type { Payments, PaymentRequestOptions } from '@square/web-sdk';

// Internals
import NoLocationIdOrAppId from '../components/NoLocationIdOrAppId/NoLocationIdOrAppId';
import { INITIAL_STATE_METHODS } from '../constants';
import { useDynamicCallback } from '../hooks';
import { methodsReducer } from '../reducers';
import type {
  ActionMethodReducer,
  FormContextInterface,
  MethodsSupported,
} from '../@types';

/**
 * Export the hook here so we avoid circular dependency
 */
export const useForm = (): FormContextInterface => {
  const context = React.useContext(FormContext);

  if (context === undefined) {
    throw new Error('useForm must be used within a FormProvider');
  }

  return context;
};

/**
 * Internal helper that the `SquareForm` uses to manage internal state and expose access to the Web Payment SDK library.
 *
 * This is available for developers who require more customization over their payment form implementation. Please refer to the
 * [customization](customization.md) page for usage details.
 */
export const FormContext = React.createContext<FormContextInterface>({
  ach: 'loading',
  applePay: 'loading',
  card: 'loading',
  cashApp: 'loading',
  googlePay: 'loading',
  giftCard: 'loading',
  formId: '',
  payments: (null as unknown) as Payments,
  dispatchMethods: (null as unknown) as React.Dispatch<ActionMethodReducer>,
  cardTokenizeResponseReceived: (null as unknown) as (
    props: TokenResult
  ) => void,
  createPaymentRequest: (null as unknown) as PaymentRequestOptions,
});

interface ProviderProps {
  applicationId: string;
  locationId: string;
  createPaymentRequest?: () => PaymentRequestOptions;
  methodsSupported?: MethodsSupported;
  cardTokenizeResponseReceived: (props: TokenResult) => void;
  createVerificationDetails?: () =>
    | ChargeVerifyBuyerDetails
    | StoreVerifyBuyerDetails;
}

const FormProvider: React.FC<ProviderProps> = ({ children, ...props }) => {
  const [applicationId] = React.useState(() => props.applicationId);
  const [locationId] = React.useState(() => props.locationId);
  const [pay, setPay] = React.useState<Payments>();
  const [createPaymentRequest] = React.useState<
    undefined | PaymentRequestOptions
  >(() => props.createPaymentRequest?.());
  const [methods, dispatch] = React.useReducer(
    methodsReducer,
    INITIAL_STATE_METHODS
  );

  const cardTokenizeResponseReceived = (rest: TokenResult): void => {
    if (rest.errors || !props.createVerificationDetails) {
      props.cardTokenizeResponseReceived(rest);
      return;
    }

    pay?.verifyBuyer(String(rest.token), props.createVerificationDetails());
  };

  // Fixes stale closure issue with using React Hooks & SqPaymentForm callback functions
  // https://github.com/facebook/react/issues/16956
  const cardTokenizeResponseReceivedCallback = useDynamicCallback(
    cardTokenizeResponseReceived
  );

  /**
   * Helper function to update the state of the form and retreive the available methods
   *
   * @param methods The methods that you want to support
   */
  const methodsSupported = (
    methods: MethodsSupported = props.methodsSupported || {
      card: true,
    }
  ): void => {
    let result = { ...INITIAL_STATE_METHODS };

    for (const [method, enabled] of Object.entries(methods)) {
      if (enabled) {
        Object.keys(INITIAL_STATE_METHODS).map((initialMethod) => {
          if (method === initialMethod) {
            result = {
              ...result,
              [initialMethod]: 'ready',
            };

            return;
          }
        });
      }
    }

    dispatch({
      type: 'CHANGE_STATE',
      // @ts-ignore
      payload: result,
    });
  };

  async function loadPayment(): Promise<void> {
    methodsSupported();

    await payments(applicationId, locationId).then((res) => {
      if (res === null) {
        throw new Error('Square Web Payments SDK failed to load');
      }

      setPay(res);

      return res;
    });
  }

  React.useEffect(() => {
    if (applicationId && locationId) {
      loadPayment();
    }
  }, [applicationId, locationId]);

  if (!applicationId || !locationId) {
    return <NoLocationIdOrAppId />;
  }

  if (!pay) {
    return null;
  }

  const context = {
    ...methods,
    formId: '',
    payments: pay,
    dispatchMethods: dispatch,
    // @ts-ignore: Always true error
    cardTokenizeResponseReceived: props.cardTokenizeResponseReceived
      ? cardTokenizeResponseReceivedCallback
      : null,
    createPaymentRequest,
  };

  return (
    <FormContext.Provider value={context}>{children}</FormContext.Provider>
  );
};

export default FormProvider;
