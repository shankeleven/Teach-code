"use client";

import React, { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { go } from "@codemirror/lang-go";
import { cpp } from "@codemirror/lang-cpp";
import { java as javaLang } from "@codemirror/lang-java";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { githubDark } from "@uiw/codemirror-theme-github";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { xcodeDark } from "@uiw/codemirror-theme-xcode";

const themes = {
  dracula,
  github: githubDark,
  vscode: vscodeDark,
  xcode: xcodeDark,
};
const languages = { javascript, python, go, cpp, java: javaLang, html, css };

export default function Editor({
  socketRef,
  roomId,
  onCodeChange,
  code,
  theme,
  language,
}) {
  const [extensions, setExtensions] = useState([javascript({ jsx: true })]);

  useEffect(() => {
    if (languages[language]) {
      setExtensions([languages[language]()]);
    }
  }, [language]);

  const handleChange = (newCode) => {
    // Always call onCodeChange to update parent state
    onCodeChange(newCode);
  };

  return (
    <CodeMirror
      value={code}
      height="100vh"
      theme={themes[theme]}
      extensions={extensions}
      onChange={handleChange}
    />
  );
}
