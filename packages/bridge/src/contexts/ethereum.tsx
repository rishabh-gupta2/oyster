import React, { createContext, FunctionComponent, useCallback, useContext, useEffect, useState } from "react";
import Web3 from "web3";
import Web3Modal from "web3modal";
// @ts-ignore
import WalletConnectProvider from "@walletconnect/web3-provider";
// @ts-ignore
import Fortmatic from "fortmatic";
import Torus from "@toruslabs/torus-embed";
import Authereum from "authereum";
import { Bitski } from "bitski";
import { useWallet } from "@oyster/common";

const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider,
    options: {
      infuraId: process.env.REACT_APP_INFURA_ID
    }
  },
  torus: {
    package: Torus
  },
  fortmatic: {
    package: Fortmatic,
    options: {
      key: process.env.REACT_APP_FORTMATIC_KEY
    }
  },
  authereum: {
    package: Authereum
  },
  bitski: {
    package: Bitski,
    options: {
      clientId: process.env.REACT_APP_BITSKI_CLIENT_ID,
      callbackUrl: window.location.href + "bitski-callback.html"
    }
  }
};

export interface EthereumContextState {
  connect: () => Promise<void>;
  web3?: Web3
}

export const EthereumContext = createContext<EthereumContextState>({
  connect: async () => {  },
});

export const EthereumProvider: FunctionComponent = ({children}) => {
  const [web3, setWeb3] = useState<Web3>();
  const { connected } = useWallet();

  const connect = useCallback(async () => {
    const web3Modal = new Web3Modal({
      theme: "dark",
      network: "mainnet", // optional (TODO: add network selector)
      cacheProvider: false, // optional
      providerOptions // required
    });

    const provider = await web3Modal.connect();

    provider.on('error', (e: any) => console.error('WS Error', e));
    provider.on('end', (e: any) => console.error('WS End', e));

    provider.on('disconnect', (error: { code: number; message: string }) => {
      console.log(error);
    });
    provider.on('connect', (info: { chainId: number }) => {
      console.log(info);
    });

    const instance = new Web3(provider);
    setWeb3(instance);
  }, [setWeb3]);

  useEffect(() => {
    if(connected) {
      connect();
    }
  }, [connect, connected])

  return (
    <EthereumContext.Provider value={{ web3, connect }}>
      {children}
    </EthereumContext.Provider>
  );
}

export const useEthereum = () => {
  const context = useContext(EthereumContext);
  return context;
}