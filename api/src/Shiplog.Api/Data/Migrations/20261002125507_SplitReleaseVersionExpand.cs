using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shiplog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SplitReleaseVersionExpand : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Releases_AppId_EnvironmentId_Platform_Version",
                table: "Releases");

            migrationBuilder.AlterColumn<string>(
                name: "Version",
                table: "Releases",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(50)",
                oldMaxLength: 50);

            migrationBuilder.AddColumn<int>(
                name: "BuildNumber",
                table: "Releases",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VersionName",
                table: "Releases",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            // Hand-written: split every existing Version into VersionName and
            // BuildNumber. "2.4.0 (118)" becomes ("2.4.0", 118); anything that
            // doesn't end in a parenthesised whole number stays a name with no
            // build. Must agree with ReleaseVersion.Parse. Self-contained on
            // purpose: a migration must not change if application code does.
            migrationBuilder.Sql(BackfillSql);

            migrationBuilder.CreateIndex(
                name: "IX_Releases_AppId_EnvironmentId_Platform_Version",
                table: "Releases",
                columns: new[] { "AppId", "EnvironmentId", "Platform", "Version" },
                unique: true,
                filter: "[Version] IS NOT NULL");
        }

        internal const string BackfillSql = """
            UPDATE r
            SET VersionName = CASE WHEN p.IsSplit = 1 THEN p.Name ELSE r.[Version] END,
                BuildNumber = CASE WHEN p.IsSplit = 1 THEN p.Build END
            FROM [Releases] AS r
            CROSS APPLY (
                SELECT OpenAt = CASE
                    WHEN RIGHT(r.[Version], 1) = N')' AND CHARINDEX(N'(', r.[Version]) > 0
                        THEN LEN(r.[Version]) - CHARINDEX(N'(', REVERSE(r.[Version])) + 1
                    ELSE 0 END
            ) AS o
            CROSS APPLY (
                SELECT Name = CASE WHEN o.OpenAt > 1 THEN RTRIM(LEFT(r.[Version], o.OpenAt - 1)) END,
                       Digits = CASE WHEN o.OpenAt > 1 THEN SUBSTRING(r.[Version], o.OpenAt + 1, LEN(r.[Version]) - o.OpenAt - 1) END
            ) AS d
            CROSS APPLY (
                SELECT Name = d.Name,
                       Build = TRY_CAST(d.Digits AS int),
                       IsSplit = CASE
                           WHEN LEN(d.Name) > 0 AND d.Digits NOT LIKE N'%[^0-9]%' AND LEN(d.Digits) > 0
                                AND TRY_CAST(d.Digits AS int) IS NOT NULL THEN 1
                           ELSE 0 END
            ) AS p
            WHERE r.VersionName IS NULL;
            """;

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Releases_AppId_EnvironmentId_Platform_Version",
                table: "Releases");

            // Hand-written: rows written after the next step stop writing
            // Version would otherwise lose their version when the split
            // columns are dropped below.
            migrationBuilder.Sql("""
                UPDATE [Releases]
                SET [Version] = [VersionName] + CASE WHEN [BuildNumber] IS NULL THEN N'' ELSE N' (' + CAST([BuildNumber] AS nvarchar(11)) + N')' END
                WHERE [Version] IS NULL;
                """);

            migrationBuilder.DropColumn(
                name: "BuildNumber",
                table: "Releases");

            migrationBuilder.DropColumn(
                name: "VersionName",
                table: "Releases");

            migrationBuilder.AlterColumn<string>(
                name: "Version",
                table: "Releases",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Releases_AppId_EnvironmentId_Platform_Version",
                table: "Releases",
                columns: new[] { "AppId", "EnvironmentId", "Platform", "Version" },
                unique: true);
        }
    }
}
