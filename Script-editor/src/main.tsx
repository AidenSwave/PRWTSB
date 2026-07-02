import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./style.css";
import App from "./App";

function StartupFailure({detail}:{detail:string}) {
  return <main className="startup-failure"><section><div className="logo">SE</div><h1>Script Editor could not start.</h1><p>{detail}</p><small>Close this window and launch the editor again with Run Editor.command. If the problem continues, run the project build and check the terminal for a preload error.</small></section></main>;
}

class StartupBoundary extends Component<{children:ReactNode},{error?:Error}> {
  state:{error?:Error}={};
  static getDerivedStateFromError(error:Error){return{error}}
  componentDidCatch(error:Error,info:ErrorInfo){console.error("Script Editor renderer failed",error,info.componentStack)}
  render(){return this.state.error?<StartupFailure detail={this.state.error.message}/>:this.props.children}
}

const root=document.getElementById("root");
if(!root)throw new Error("Script Editor root element is missing.");
const bridge=window.desktop;
const bridgeReady=(bridge&&[bridge.open,bridge.save,bridge.preview,bridge.onPreviewError].every(method=>typeof method==="function"))||/^https?:$/.test(location.protocol);
createRoot(root).render(<React.StrictMode>{bridgeReady?<StartupBoundary><App/></StartupBoundary>:<StartupFailure detail="The Electron desktop bridge did not load. The generated preload files may be missing or out of date."/>}</React.StrictMode>);
