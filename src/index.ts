import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// recursively find all ts files in directory
const findFiles = (dir: string): string[] => {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const tsFiles: string[] = [];
  files.forEach((file) => {
    if (file.isDirectory()) {
      tsFiles.push(...findFiles(`${dir}/${file.name}`));
    } else if (file.isFile() && file.name.endsWith(".ts")) {
      tsFiles.push(path.join(dir, file.name));
    }
  });
  return tsFiles;
};

const ROOT_FOLDER = "path\\to\\folder\\that\\has\\fosscord-server";
const SRC_FOLDER = "fosscord-server\\src\\util";

const files = findFiles(path.join(ROOT_FOLDER, SRC_FOLDER));

const program = ts.createProgram(files, {});
const checker = program.getTypeChecker();

for (const file of files) {
  console.log(`Processing file ${file}`);
  const sourceFile = program.getSourceFile(file);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  if (!sourceFile) {
    throw new Error("Source file not found");
  }

  let outputText = "";

  ts.forEachChild(sourceFile, (node) => {
    if (
      ts.isEnumDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    ) {
      console.log(`Processing enum or interface: ${node.name.escapedText}`);
      // copy the enum or interface to the output file
      const result = printer.printNode(
        ts.EmitHint.Unspecified,
        node,
        sourceFile
      );

      outputText += result + "\n";
    } else if (ts.isExportDeclaration(node)) {
      console.log(`Processing export declaration`);
      const result = printer.printNode(
        ts.EmitHint.Unspecified,
        node,
        sourceFile
      );

      outputText += result + "\n";
    } else if (ts.isImportDeclaration(node)) {
      console.log(`Processing import declaration`);
      // only copy files that are in the list of files
      if (node.moduleSpecifier) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          if (node.moduleSpecifier.text.startsWith(".")) {
            const result = printer.printNode(
              ts.EmitHint.Unspecified,
              node,
              sourceFile
            );

            outputText += result + "\n";
          }
        }
      }
    } else if (ts.isClassDeclaration(node)) {
      const hasStaticMembers = node.members.some((member) => {
        if (ts.isPropertyDeclaration(member)) {
          if (member.modifiers) {
            return member.modifiers.some((modifier) => {
              return modifier.kind === ts.SyntaxKind.StaticKeyword;
            });
          }
        }
        return false;
      });

      const isStaticMember = (member: ts.PropertyDeclaration) => {
        if (member.modifiers) {
          return member.modifiers.some((modifier) => {
            return modifier.kind === ts.SyntaxKind.StaticKeyword;
          });
        }
        return false;
      };

      if (hasStaticMembers) {
        console.log(
          `Processing static class declaration: ${node.name?.escapedText}`
        );

        // This was an attempt to convert static members to enums
        //   // convert the static members to enums
        //   staticMembers.forEach((member) => {
        //     if (ts.isPropertyDeclaration(member)) {
        //       if (member.initializer) {
        //         if (ts.isObjectLiteralExpression(member.initializer)) {
        //           // create a new enum declaration

        //           const enumDeclaration = ts.factory.createEnumDeclaration(
        //             [ts.factory.createToken(ts.SyntaxKind.ExportKeyword)],
        //             // @ts-ignore
        //             node.name?.escapedText,
        //             member.initializer.properties.map((property) => {
        //               if (ts.isPropertyAssignment(property)) {
        //                 return ts.factory.createEnumMember(
        //                   // @ts-ignore
        //                   property.name.escapedText,
        //                   property.initializer
        //                 );
        //               }
        //               // @ts-ignore
        //               return ts.factory.createEnumMember(property.name.escapedText);
        //             })
        //           );

        //           const result = printer.printNode(
        //             ts.EmitHint.Unspecified,
        //             enumDeclaration,
        //             sourceFile
        //           );

        //           outputText += result + "\n";
        //         }
        //       }
        //     }
        //   });

        const result = printer.printNode(
          ts.EmitHint.Unspecified,
          node,
          sourceFile
        );

        outputText += result + "\n";
        return;
      }

      console.log(`Processing class declaration: ${node.name?.escapedText}`);

      const members: ts.PropertySignature[] = node.members
        .filter(
          (member) =>
            ts.isPropertyDeclaration(member) && !isStaticMember(member)
        )
        .map((member) => {
          const propertyDeclaration = member;
          return ts.factory.createPropertySignature(
            undefined,
            // @ts-ignore
            propertyDeclaration.name,
            // @ts-ignore
            propertyDeclaration.questionToken,
            // @ts-ignore
            propertyDeclaration.type
          );
        });

      // merge properties from parent class
      if (node.heritageClauses) {
        node.heritageClauses.forEach((heritageClause) => {
          if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
            heritageClause.types.forEach((type) => {
              const symbol = checker.getSymbolAtLocation(type.expression);
              if (symbol) {
                const type = checker.getDeclaredTypeOfSymbol(symbol);
                if (type) {
                  if (type.symbol) {
                    const declaration = type.symbol.valueDeclaration;
                    if (declaration) {
                      if (ts.isClassDeclaration(declaration)) {
                        declaration.members
                          .filter((member) => ts.isPropertyDeclaration(member))
                          .forEach((member) => {
                            const propertyDeclaration = member;
                            members.unshift(
                              ts.factory.createPropertySignature(
                                undefined,
                                // @ts-ignore
                                propertyDeclaration.name,
                                // @ts-ignore
                                propertyDeclaration.questionToken,
                                // @ts-ignore
                                propertyDeclaration.type
                              )
                            );
                          });
                      }
                    }
                  }
                }
              }
            });
          }
        });
      }

      const interfaceNode = ts.factory.createInterfaceDeclaration(
        [ts.factory.createToken(ts.SyntaxKind.ExportKeyword)],
        node.name!,
        node.typeParameters,
        undefined,
        members
      );
      const result = printer.printNode(
        ts.EmitHint.Unspecified,
        interfaceNode,
        sourceFile
      );

      outputText += result + "\n";
    }
  });

  const a = file.split(ROOT_FOLDER)[1];
  fs.mkdirSync(path.dirname(a), { recursive: true });
  fs.writeFileSync(a, outputText);
}
