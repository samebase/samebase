import React from "react";
import { Hello } from "./Hello";
import { Info } from "./Info";
import { useTracker } from "meteor/react-meteor-data";
import { Meteor } from "meteor/meteor";
import { LoginForm } from "./LoginForm";

export const App = () => {
  const user = useTracker(() => Meteor.user());

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div>
      <h1>Welcome to Meteor!</h1>
      <Hello />
      <Info />
    </div>
  );
};
