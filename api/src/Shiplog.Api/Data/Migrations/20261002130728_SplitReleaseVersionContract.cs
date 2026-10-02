using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shiplog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SplitReleaseVersionContract : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Hand-written: EF sees no model change, because the switch step
            // already stopped mapping Version. No running API version maps it
            // any more, so it can finally go.
            migrationBuilder.DropColumn(
                name: "Version",
                table: "Releases");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Hand-written: bring the column back, with its values rebuilt, so
            // the switch step's own Down() finds what it expects.
            migrationBuilder.AddColumn<string>(
                name: "Version",
                table: "Releases",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE [Releases]
                SET [Version] = [VersionName] + CASE WHEN [BuildNumber] IS NULL THEN N'' ELSE N' (' + CAST([BuildNumber] AS nvarchar(11)) + N')' END;
                """);
        }
    }
}
