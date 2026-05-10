declare module "sql.js" {
  interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string, params?: any[]): any[];
    close(): void;
    export(): Uint8Array;
  }
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }
  export default function(opts?: object): Promise<SqlJsStatic>;
}
