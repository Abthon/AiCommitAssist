const vscode = require("vscode");
const simpleGit = require("simple-git");

/**
 * @param {{ secrets: any; subscriptions: vscode.Disposable[]; }} context
 */
function activate(context) {
  let savedFlag = false;
  const secrets = context.secrets;

  const welcomeUser = vscode.commands.registerCommand(
    "aicommitassist.activateAiCommitAssist",
    async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your TogetherAi API key",
        placeHolder: "API Key",
        ignoreFocusOut: true,
      });

      if (!apiKey) {
        vscode.window.showErrorMessage(
          "API key is required to generate commit messages."
        );
        return;
      }
      await secrets.store("apiKey", apiKey);
      vscode.window.showInformationMessage(
        "AiCommitAssist online. Ready for seamless commits!"
      );
    }
  );

  context.subscriptions.push(welcomeUser);
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      savedFlag = true;
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (document) => {
      if (savedFlag) {
        if (!vscode.workspace.workspaceFolders) {
          vscode.window.showErrorMessage("No open workspace");
          return;
        }
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          vscode.workspace.workspaceFolders[0].uri
        );
        const workspaceRoot = workspaceFolder.uri.fsPath;
        const git = simpleGit(workspaceRoot);

        // const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const apiKey = await secrets.get("apiKey");
        if (!apiKey) {
          vscode.window.showErrorMessage(
            "API key is required to generate commit messages."
          );
          savedFlag = false;
          return;
        }

        const filePath = vscode.workspace.asRelativePath(
          document.document.uri.fsPath
        );
        try {
          await git.add(filePath);
          const diff = await git.diff(["--cached", "--", filePath]);

          if (diff) {
              // test prompt "Generate a one-line commit message for the changes: ->";
            const prompt = "Please generate a **concise one-line commit message** summarizing the changes in the provided code diff."
            const url = "https://api.together.xyz/v1/chat/completions";
            const APikey = apiKey;

            const headers = new Headers({
              "Content-Type": "application/json",
              Authorization: `Bearer ${APikey}`,
            });

            const data = {
              model: "togethercomputer/llama-2-70b-chat",
              max_tokens: 50,
              messages: [
                {
                  role: "system",
                  content:
                    "You are an AI assistant helping with generating a concise commit message.",
                },
                {
                  role: "user",
                  content: `
                ${prompt}

                ----------

                ${diff}

                ----------
                `,
                },
              ],
            };

            const options = {
              method: "POST",
              headers,
              body: JSON.stringify(data),
            };
            try {
              var commitMessage = "";
              const response = await fetch(url, options);
              const result = await response.json();
              commitMessage = result.choices[0].message.content;
              if (commitMessage) {
                console.log(commitMessage, "the response is this");
                await git.commit(commitMessage, filePath);
                vscode.window.showInformationMessage(
                  `Done, File ${filePath.split('/')[filePath.split("/").length-1]} committed with message: ${commitMessage}`
                );
              } else {
                vscode.window.showErrorMessage(
                  "Commit yourself man 😅, Dunno why but for some reason the AI service returned an empty commit message."
                );
              }
            } catch (error) {
              console.error("Error:", error);
            }
          } else {
            vscode.window.showInformationMessage(
              `No changes detected in ${filePath.split('/')[filePath.split("/").length-1]} to commit.`
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage("Failed to stage and commit changes");
          console.error(error);
        }
      }
      savedFlag = false;
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};