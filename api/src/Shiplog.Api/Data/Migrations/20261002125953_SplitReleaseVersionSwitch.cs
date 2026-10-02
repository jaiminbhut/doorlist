using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shiplog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SplitReleaseVersionSwitch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Hand-written: rows the pre-split API wrote while the expand step
            // was rolling out have only Version. Split them before VersionName
            // becomes required. Same SQL as the expand step, copied so this
            // migration stays self-contained.
            migrationBuilder.Sql(BackfillSql);

            migrationBuilder.DropIndex(
                name: "IX_Releases_AppId_EnvironmentId_Platform_Version",
                table: "Releases");

            // Hand-edited: EF generated DropColumn("Version") here, because the
            // model no longer maps it. The column stays (nullable since the
            // expand step) because the expand-step API may still be running and
            // writing it. The contract step drops it.

            migrationBuilder.AlterColumn<string>(
                name: "VersionName",
                table: "Releases",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Releases_AppId_EnvironmentId_Platform_VersionName_BuildNumber",
                table: "Releases",
                columns: new[] { "AppId", "EnvironmentId", "Platform", "VersionName", "BuildNumber" },
                unique: true);
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
                name: "IX_Releases_AppId_EnvironmentId_Platform_VersionName_BuildNumber",
                table: "Releases");

            // Hand-written: this step writes no Version. Rebuild it so the
            // expand-step API's duplicate check and old index have it again.
            migrationBuilder.Sql("""
                UPDATE [Releases]
                SET [Version] = [VersionName] + CASE WHEN [BuildNumber] IS NULL THEN N'' ELSE N' (' + CAST([BuildNumber] AS nvarchar(11)) + N')' END
                WHERE [Version] IS NULL;
                """);

            migrationBuilder.AlterColumn<string>(
                name: "VersionName",
                table: "Releases",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(50)",
                oldMaxLength: 50);

            // Hand-edited: EF generated AddColumn("Version") here; the column
            // was never dropped.

            migrationBuilder.CreateIndex(
                name: "IX_Releases_AppId_EnvironmentId_Platform_Version",
                table: "Releases",
                columns: new[] { "AppId", "EnvironmentId", "Platform", "Version" },
                unique: true,
                filter: "[Version] IS NOT NULL");
        }
    }
}
